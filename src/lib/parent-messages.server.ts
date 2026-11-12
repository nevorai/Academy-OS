import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeUsage } from "@/lib/usage-cap.server";
import { publicMediaUrl } from "@/lib/media-paths";
import { fetchAllRows } from "@/lib/fetch-all";

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
  match_result: "academy_match_result",
  progress: "academy_progress",
} as const;

/** Template for a new player's login. Sent straight away and never saved (the password must not sit in a table). */
export const CREDENTIALS_TEMPLATE = "academy_credentials";
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
  on_match_result: boolean;
  on_progress: boolean;
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

/** "YYYY-MM" of the month before the given India date ("YYYY-MM-DD"). */
export function previousMonthKey(istToday: string): string {
  const y = Number(istToday.slice(0, 4));
  const m = Number(istToday.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Start and end (UTC instants) of an India calendar month "YYYY-MM". */
export function monthRangeIst(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1) - 330 * 60 * 1000;
  const end = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - 330 * 60 * 1000;
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

const istDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));

/**
 * Attendance report from check-in times: how many training days the academy ran that month
 * (a day counts if anyone checked in) and how many of those each player came. Players with no check-in are left out.
 */
export function attendanceSummary(marks: { student_id: string; check_in_at: string | null }[]) {
  const academyDays = new Set<string>();
  const byStudent = new Map<string, Set<string>>();
  for (const m of marks) {
    if (!m.check_in_at) continue;
    const d = istDate(m.check_in_at);
    academyDays.add(d);
    if (!byStudent.has(m.student_id)) byStudent.set(m.student_id, new Set());
    byStudent.get(m.student_id)!.add(d);
  }
  const total = academyDays.size;
  const rows = [...byStudent.entries()].map(([studentId, days]) => ({
    studentId,
    came: days.size,
    total,
    percent: total ? Math.round((days.size / total) * 100) : 0,
  }));
  return { total, rows };
}

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

  // Match result: when a match is finished, tell the parents of every player in either team.
  if (link.on_match_result) {
    const { data: ms } = await db
      .from("mc_matches")
      .select("id, team_a_id, team_b_id, result, completed_at")
      .eq("tenant_id", link.tenant_id)
      .not("completed_at", "is", null)
      .not("result", "is", null)
      .gte("completed_at", from)
      .limit(100);
    const matches = (ms ?? []) as {
      id: string;
      team_a_id: string;
      team_b_id: string;
      result: string;
    }[];
    if (matches.length) {
      const teamIds = [...new Set(matches.flatMap((m) => [m.team_a_id, m.team_b_id]))];
      const [{ data: teams }, { data: roster }] = await Promise.all([
        db.from("mc_teams").select("id, name").in("id", teamIds),
        db
          .from("mc_team_players")
          .select("team_id, student_id")
          .eq("tenant_id", link.tenant_id)
          .in("team_id", teamIds),
      ]);
      const teamName = new Map(
        ((teams ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
      );
      const players = (roster ?? []) as { team_id: string; student_id: string }[];
      const kids = await studentsById(
        db,
        link.tenant_id,
        players.map((p) => p.student_id),
      );
      const rows: Row[] = [];
      for (const m of matches) {
        const title = `${teamName.get(m.team_a_id) ?? "Team A"} vs ${teamName.get(m.team_b_id) ?? "Team B"}`;
        const text = `${title}: ${m.result}`.replace(/\s+/g, " ").slice(0, 300);
        const seen = new Set<string>();
        for (const p of players) {
          if (p.team_id !== m.team_a_id && p.team_id !== m.team_b_id) continue;
          if (seen.has(p.student_id)) continue;
          seen.add(p.student_id);
          const s = kids.get(p.student_id);
          if (!s) continue;
          for (const to of recipientsFor(s))
            rows.push({
              tenant_id: link.tenant_id,
              student_id: s.id,
              kind: "match_result",
              ref: `match:${m.id}:${s.id}:${to.phone}`,
              to_phone: to.phone,
              variables: [to.greeting, s.name, text, academyName],
            });
        }
      }
      queued += await insertRows(db, rows);
    }
  }

  // Monthly attendance report: on the 1st to 3rd, for the month that just ended.
  if (link.on_progress && istDay <= 3) {
    const period = previousMonthKey(istToday);
    const range = monthRangeIst(period);
    const marks = await fetchAllRows(() =>
      db
        .from("attendance_marks")
        .select("id, student_id, check_in_at")
        .eq("tenant_id", link.tenant_id)
        .is("superseded_by", null)
        .gte("check_in_at", range.from)
        .lt("check_in_at", range.to)
        .order("id"),
    );
    if (!marks.error) {
      const sum = attendanceSummary(
        marks.data as { student_id: string; check_in_at: string | null }[],
      );
      const kids = await studentsById(
        db,
        link.tenant_id,
        sum.rows.map((r) => r.studentId),
      );
      const rows: Row[] = [];
      for (const r of sum.rows) {
        const s = kids.get(r.studentId);
        if (!s) continue;
        for (const to of recipientsFor(s))
          rows.push({
            tenant_id: link.tenant_id,
            student_id: s.id,
            kind: "progress",
            ref: `prog:${period}:${s.id}:${to.phone}`,
            to_phone: to.phone,
            variables: [
              to.greeting,
              s.name,
              monthLabel(period),
              `${r.came} of ${r.total}`,
              `${r.percent}%`,
              academyName,
            ],
          });
      }
      queued += await insertRows(db, rows);
    }
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
      "tenant_id, api_key, enabled_at, on_checkin, on_checkout, on_fee_reminder, on_fee_received, on_match_result, on_progress, fee_remind_from_day",
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

/**
 * Sends a new player's login (ID, temporary password, sign-in link) on WhatsApp through Connect.
 * Goes to the player's own number and the parent's. Nothing is stored; the password lives only in this call.
 * Returns how many numbers it was sent to (0 when WhatsApp is not connected or switched off).
 */
export async function sendCredentialsWhatsApp(
  db: Db,
  input: {
    tenantId: string;
    studentId: string;
    academy: string;
    loginId: string;
    password: string;
    url: string;
    student: Pick<StudentLite, "name" | "guardian_name" | "guardian_phone" | "phone">;
  },
): Promise<number> {
  const { data: link } = await db
    .from("connect_links")
    .select("api_key, enabled")
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  const key = (link as { api_key: string | null; enabled: boolean } | null)?.api_key;
  if (!key || !(link as { enabled: boolean }).enabled) return 0;
  let sent = 0;
  for (const r of recipientsFor(input.student)) {
    const cap = await consumeUsage(input.tenantId, "whatsapp");
    if (!cap.ok) break;
    try {
      const res = await fetch(`${CONNECT_URL()}/api/v1/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: r.phone,
          template: CREDENTIALS_TEMPLATE,
          variables: [r.greeting, input.academy, input.loginId, input.password, input.url],
          ref: `${input.tenantId.slice(0, 8)}:cred:${input.studentId}:${r.phone}:${Date.now()}`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) sent++;
    } catch {
      /* the owner still sees the login on screen and can send it by hand */
    }
  }
  return sent;
}
