import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeUsage } from "@/lib/usage-cap.server";
import { publicMediaUrl } from "@/lib/media-paths";

/**
 * Automatic WhatsApp messages to parents, sent through Nevorai Connect (https://connect.nevorai.com/api/v1/send).
 * Server only. Two steps every run: (1) turn new events (check-in, check-out, fee reminder, fee received) into
 * queued rows, (2) send the queued rows. Every row has a unique `ref`, so a repeat run never sends twice.
 * Only events AFTER the owner switched messages on are sent (connect_links.enabled_at).
 */

type Db = SupabaseClient;

export const TEMPLATE_FOR = {
  checkin: "academy_checkin",
  checkout: "academy_checkout",
  fee_due: "academy_fee_due",
  fee_received: "academy_fee_received",
} as const;
export type MessageKind = keyof typeof TEMPLATE_FOR;

const CONNECT_URL = () => process.env.CONNECT_BASE_URL || "https://connect.nevorai.com";
const MAX_ATTEMPTS = 5;
const SEND_BATCH = 100;

type Link = {
  tenant_id: string;
  api_key: string;
  enabled_at: string;
  on_checkin: boolean;
  on_checkout: boolean;
  on_fee_reminder: boolean;
  on_fee_received: boolean;
  fee_remind_from_day: number;
  fee_cycle: string | null;
};

type StudentLite = {
  id: string;
  name: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  phone: string | null;
};

/** 10-digit Indian numbers get 91 in front; anything else must already have its country code. Null when unusable. */
export function parentPhone(p: string | null | undefined): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export const greetName = (s: Pick<StudentLite, "guardian_name">) =>
  s.guardian_name?.trim() || "Parent";

export type Recipient = { phone: string; greeting: string };

/**
 * Every saved number gets the message: the parent's AND the player's own. Same number in both = once.
 * The parent is greeted by the guardian's name, the player by their own name.
 */
export function recipientsFor(
  s: Pick<StudentLite, "name" | "guardian_name" | "guardian_phone" | "phone">,
): Recipient[] {
  const out: Recipient[] = [];
  const add = (raw: string | null, greeting: string) => {
    const phone = parentPhone(raw);
    if (phone && !out.some((r) => r.phone === phone)) out.push({ phone, greeting });
  };
  add(s.guardian_phone, greetName(s));
  add(s.phone, s.name);
  return out;
}

export function istTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .toLowerCase();
}

export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

async function studentsById(
  db: Db,
  tenantId: string,
  ids: string[],
): Promise<Map<string, StudentLite>> {
  const map = new Map<string, StudentLite>();
  const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await db
      .from("students")
      .select("id, name, guardian_name, guardian_phone, phone")
      .eq("tenant_id", tenantId)
      .in("id", uniq.slice(i, i + 200));
    for (const s of (data ?? []) as StudentLite[]) map.set(s.id, s);
  }
  return map;
}

type Row = {
  tenant_id: string;
  student_id: string;
  kind: MessageKind;
  ref: string;
  to_phone: string;
  variables: string[];
  header_image?: string | null;
};

async function insertRows(db: Db, rows: Row[]): Promise<number> {
  if (!rows.length) return 0;
  // ignoreDuplicates: a ref we already queued (or sent) is left alone.
  const { data, error } = await db
    .from("parent_messages")
    .upsert(rows, { onConflict: "tenant_id,ref", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("parent_messages insert failed", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/** Step 1 for one academy: new events -> queued rows. */
export async function enqueueForTenant(
  db: Db,
  link: Link,
  academyName: string,
  upi: { id: string; qr: string },
) {
  const since = link.enabled_at;
  const horizon = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const from = since > horizon ? since : horizon;
  let queued = 0;

  // Check-in / check-out (one message per mark, never for a corrected-away mark)
  if (link.on_checkin || link.on_checkout) {
    const { data: marks } = await db
      .from("attendance_marks")
      .select("id, student_id, check_in_at, check_out_at")
      .eq("tenant_id", link.tenant_id)
      .is("superseded_by", null)
      .or(`check_in_at.gte.${from},check_out_at.gte.${from}`)
      .limit(500);
    const list = (marks ?? []) as {
      id: string;
      student_id: string;
      check_in_at: string | null;
      check_out_at: string | null;
    }[];
    const kids = await studentsById(
      db,
      link.tenant_id,
      list.map((m) => m.student_id),
    );
    const rows: Row[] = [];
    for (const m of list) {
      const s = kids.get(m.student_id);
      if (!s) continue;
      for (const r of recipientsFor(s)) {
        if (link.on_checkin && m.check_in_at && m.check_in_at >= from)
          rows.push({
            tenant_id: link.tenant_id,
            student_id: s.id,
            kind: "checkin",
            ref: `ci:${m.id}:${r.phone}`,
            to_phone: r.phone,
            variables: [r.greeting, s.name, istTime(m.check_in_at), academyName],
          });
        if (link.on_checkout && m.check_out_at && m.check_out_at >= from)
          rows.push({
            tenant_id: link.tenant_id,
            student_id: s.id,
            kind: "checkout",
            ref: `co:${m.id}:${r.phone}`,
            to_phone: r.phone,
            variables: [r.greeting, s.name, istTime(m.check_out_at), academyName],
          });
      }
    }
    queued += await insertRows(db, rows);
  }

  // Fee reminders: the daily job already writes reminder_logs; we send them instead of waiting for a tap.
  const istToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
  const istDay = Number(istToday.slice(8, 10));
  // Calendar-month academies: nothing before the owner's chosen day. Joining-date academies: the job already waits for the due date.
  const reminderDayReached =
    link.fee_cycle === "joining_date" || istDay >= link.fee_remind_from_day;
  if (link.on_fee_reminder && reminderDayReached) {
    const { data: rem } = await db
      .from("reminder_logs")
      .select("id, student_id, period, amount")
      .eq("tenant_id", link.tenant_id)
      .eq("channel", "whatsapp")
      .eq("status", "queued")
      .eq("sent_on", istToday)
      .gte("created_at", since)
      .limit(500);
    const list = (rem ?? []) as {
      id: string;
      student_id: string;
      period: string;
      amount: number | null;
    }[];
    const kids = await studentsById(
      db,
      link.tenant_id,
      list.map((r) => r.student_id),
    );
    const rows: Row[] = [];
    for (const r of list) {
      const s = kids.get(r.student_id);
      if (!s || !r.amount) continue;
      for (const to of recipientsFor(s))
        rows.push({
          tenant_id: link.tenant_id,
          student_id: s.id,
          kind: "fee_due",
          ref: `fee:${r.id}:${to.phone}`,
          to_phone: to.phone,
          variables: [
            to.greeting,
            s.name,
            monthLabel(r.period),
            inr(r.amount),
            academyName,
            upi.id || "the UPI QR above",
          ],
          header_image: upi.qr || null,
        });
    }
    queued += await insertRows(db, rows);
  }

  // Fee received: owner verified / recorded a payment.
  if (link.on_fee_received) {
    const { data: pays } = await db
      .from("payments")
      .select("id, student_id, amount, period, receipt_no")
      .eq("tenant_id", link.tenant_id)
      .not("student_id", "is", null)
      .gte("created_at", from)
      .limit(500);
    const list = (pays ?? []) as {
      id: string;
      student_id: string;
      amount: number;
      period: string | null;
      receipt_no: number;
    }[];
    const kids = await studentsById(
      db,
      link.tenant_id,
      list.map((p) => p.student_id),
    );
    const rows: Row[] = [];
    for (const p of list) {
      const s = kids.get(p.student_id);
      if (!s) continue;
      for (const to of recipientsFor(s))
        rows.push({
          tenant_id: link.tenant_id,
          student_id: s.id,
          kind: "fee_received",
          ref: `pay:${p.id}:${to.phone}`,
          to_phone: to.phone,
          variables: [
            to.greeting,
            s.name,
            inr(p.amount),
            p.period ? monthLabel(p.period) : "this month",
            String(p.receipt_no),
            academyName,
          ],
        });
    }
    queued += await insertRows(db, rows);
  }
  return queued;
}

type QueuedRow = {
  id: string;
  tenant_id: string;
  kind: MessageKind;
  ref: string;
  to_phone: string;
  variables: string[];
  header_image: string | null;
  attempts: number;
};

/** Step 2: send queued rows for one academy (cap first, then Connect). */
export async function sendQueued(
  db: Db,
  link: Link,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  const { data } = await db
    .from("parent_messages")
    .select("id, tenant_id, kind, ref, to_phone, variables, header_image, attempts")
    .eq("tenant_id", link.tenant_id)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(SEND_BATCH);
  for (const m of (data ?? []) as QueuedRow[]) {
    const cap = await consumeUsage(link.tenant_id, "whatsapp");
    if (!cap.ok) {
      if (cap.reason === "cap") {
        await db
          .from("parent_messages")
          .update({ status: "skipped", error: "Monthly WhatsApp limit reached" })
          .eq("id", m.id);
        out.skipped++;
        continue;
      }
      break; // database blip: try again next run, send nothing unmetered
    }
    const body: Record<string, unknown> = {
      to: m.to_phone,
      template: TEMPLATE_FOR[m.kind],
      variables: m.variables,
      ref: `${m.tenant_id.slice(0, 8)}:${m.ref}`,
    };
    if (m.kind === "fee_due" && m.header_image) body.header = { image: m.header_image };
    try {
      const res = await fetch(`${CONNECT_URL()}/api/v1/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${link.api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const j = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: { code?: string; message?: string };
      };
      if (res.ok) {
        await db
          .from("parent_messages")
          .update({
            status: "sent",
            connect_id: j.id ?? null,
            sent_at: new Date().toISOString(),
            error: null,
          })
          .eq("id", m.id);
        if (m.kind === "fee_due" && m.ref.startsWith("fee:"))
          await db
            .from("reminder_logs")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", m.ref.split(":")[1]);
        out.sent++;
      } else if (j.error?.code === "opted_out") {
        await db
          .from("parent_messages")
          .update({ status: "skipped", error: "Parent replied STOP" })
          .eq("id", m.id);
        out.skipped++;
      } else if (res.status >= 500 || res.status === 429) {
        const attempts = m.attempts + 1;
        await db
          .from("parent_messages")
          .update({
            attempts,
            error: j.error?.message ?? `Connect ${res.status}`,
            status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
          })
          .eq("id", m.id);
        if (attempts >= MAX_ATTEMPTS) out.failed++;
        if (res.status === 429) break;
      } else {
        await db
          .from("parent_messages")
          .update({ status: "failed", error: j.error?.message ?? `Connect ${res.status}` })
          .eq("id", m.id);
        out.failed++;
        if (res.status === 401 || res.status === 403) break; // wrong key / paused: stop this academy for now
      }
    } catch (e) {
      const attempts = m.attempts + 1;
      await db
        .from("parent_messages")
        .update({
          attempts,
          error: (e as Error).message,
          status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
        })
        .eq("id", m.id);
      break;
    }
  }
  return out;
}

export async function runParentMessages(db: Db) {
  const { data: links } = await db
    .from("connect_links")
    .select(
      "tenant_id, api_key, enabled_at, on_checkin, on_checkout, on_fee_reminder, on_fee_received, fee_remind_from_day",
    )
    .eq("enabled", true)
    .not("api_key", "is", null)
    .not("enabled_at", "is", null);
  const summary = { academies: 0, queued: 0, sent: 0, failed: 0, skipped: 0 };
  for (const link of (links ?? []) as Link[]) {
    const { data: t } = await db
      .from("tenants")
      .select("name, status, upi_id, upi_qr_url, fee_cycle")
      .eq("id", link.tenant_id)
      .maybeSingle();
    if (!t || t.status !== "active") continue;
    summary.academies++;
    const qrPath = (t.upi_qr_url as string | null) ?? "";
    const qr = qrPath.startsWith("http") ? qrPath : qrPath ? (publicMediaUrl(qrPath) ?? "") : "";
    summary.queued += await enqueueForTenant(
      db,
      { ...link, fee_cycle: (t.fee_cycle as string | null) ?? null },
      t.name as string,
      {
        id: (t.upi_id as string | null) ?? "",
        qr,
      },
    );
    const r = await sendQueued(db, link);
    summary.sent += r.sent;
    summary.failed += r.failed;
    summary.skipped += r.skipped;
  }
  return summary;
}
