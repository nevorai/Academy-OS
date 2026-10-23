/**
 * Bulk student logins.
 *
 * After a roster is imported, the owner taps "Create logins": every player gets a
 * Player ID (the username) and a random temporary password. They sign in with the
 * Player ID, their email or their phone, and are asked to choose their own password
 * on first login. Passwords are never stored by the app: they exist only in this
 * response (so the owner can share them) and, if an email address is known, in one
 * email. Owner/admin only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertManager } from "@/lib/staff/staff.functions";

const uuid = z.string().uuid();

/** 25 per call keeps each request well inside the host's time limit; the dialog loops. */
export const LOGIN_CHUNK = 25;

const createInput = z.object({
  tenantId: uuid,
  studentIds: z.array(uuid).min(1).max(LOGIN_CHUNK),
  sendEmail: z.boolean().default(true),
});

const resetInput = z.object({
  tenantId: uuid,
  studentId: uuid,
  sendEmail: z.boolean().default(true),
});

export interface LoginResult {
  studentId: string;
  name: string;
  playerId: string;
  /** What the player types as "Player ID". */
  username: string;
  /** Shown once, never stored. */
  password: string;
  phone: string | null;
  guardianPhone: string | null;
  email: string | null;
  status: "created" | "failed";
  emailSent: boolean;
  error?: string;
}

const PW_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/O/1/l/i look-alikes

function tempPassword(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const s = Array.from(bytes, (b) => PW_CHARS[b % PW_CHARS.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function usernameFrom(playerId: string | null, slug: string, fallback: string): string {
  const base = (playerId ?? "").toLowerCase().replace(/[^a-z0-9._]/g, "");
  if (base.length >= 3) return base.slice(0, 20);
  const s = slug.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "p";
  return `${s}${fallback}`.slice(0, 20);
}

function loginUrl(tenant: { slug: string; custom_domain?: string | null }): string {
  if (tenant.custom_domain) return `https://${tenant.custom_domain}/auth`;
  const base = process.env.VITE_PLATFORM_BASE_DOMAIN || "nevorai.com";
  return `https://${tenant.slug}.${base}/auth`;
}

async function sendCredentialsEmail(opts: {
  tenantId: string;
  to: string;
  name: string;
  academy: string;
  username: string;
  password: string;
  url: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  // The academy's monthly e-mail allowance (plan cap): no allowance left = not sent, the login is still created.
  const { consumeUsage } = await import("@/lib/usage-cap.server");
  if (!(await consumeUsage(opts.tenantId, "email")).ok) return false;
  const from = process.env.RESEND_FROM || "Nevorai Academy <noreply@nevorai.com>";
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px">
<h2 style="margin:0 0 8px">Welcome to ${esc(opts.academy)}</h2>
<p>Hi ${esc(opts.name)}, your account is ready.</p>
<p style="background:#f4f4f5;padding:12px 16px;border-radius:10px;line-height:1.7">
<b>Player ID:</b> ${esc(opts.username)}<br><b>Temporary password:</b> ${esc(opts.password)}</p>
<p><a href="${esc(opts.url)}">Sign in here</a>. You will be asked to choose your own password the first time.</p>
</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: `Your ${opts.academy} login`,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type AdminClient = Awaited<ReturnType<typeof getAdmin>>;
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Registers the Player ID as a username; on a clash adds a short suffix. */
async function saveUsername(admin: AdminClient, userId: string, wanted: string): Promise<string> {
  let candidate = wanted;
  for (let i = 0; i < 4; i++) {
    const { error } = await admin.from("user_usernames").insert({ user_id: userId, username: candidate } as never);
    if (!error) return candidate;
    const taken = /duplicate|unique|already/i.test(error.message);
    if (!taken) throw new Error(error.message);
    candidate = `${wanted.slice(0, 16)}.${Math.floor(100 + Math.random() * 900)}`;
  }
  throw new Error("Could not reserve a Player ID");
}

export const createStudentLogins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => createInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    const admin = await getAdmin();
    const { joinAcademy } = await import("@/lib/auth/join.functions");
    const { toE164 } = await import("@/lib/phone");

    const { data: tenant } = await admin
      .from("tenants")
      .select("name, slug, custom_domain")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (!tenant) throw new Error("Academy not found");
    const url = loginUrl(tenant as { slug: string; custom_domain?: string | null });

    const { data: students, error } = await admin
      .from("students")
      .select("id, name, phone, email, guardian_phone, player_id, user_id")
      .eq("tenant_id", data.tenantId)
      .in("id", data.studentIds);
    if (error) throw new Error(error.message);

    const results: LoginResult[] = [];
    const todo = (students ?? []).filter((s) => !s.user_id);
    const emailConfigured = Boolean(process.env.RESEND_API_KEY);

    const one = async (s: (typeof todo)[number]) => {
      const password = tempPassword();
      const wanted = usernameFrom(s.player_id, tenant.slug, s.id.replace(/-/g, "").slice(0, 6));
      const base: LoginResult = {
        studentId: s.id,
        name: s.name,
        playerId: s.player_id ?? wanted.toUpperCase(),
        username: wanted,
        password,
        phone: s.phone ?? null,
        guardianPhone: s.guardian_phone ?? null,
        email: s.email ?? null,
        status: "failed",
        emailSent: false,
      };
      try {
        const meta = { full_name: s.name, tenant_id: data.tenantId, must_change_password: true };
        const contactEmail = s.email?.trim().toLowerCase() || null;
        let userId: string | null = null;

        // The login uses the player's own email when it is free. A parent's email shared by
        // two children, or one that already belongs to another Nevorai login, falls back to a
        // private address: the player still signs in with the Player ID.
        if (contactEmail) {
          const { data: made, error: e1 } = await admin.auth.admin.createUser({
            email: contactEmail,
            password,
            email_confirm: true,
            user_metadata: meta,
          });
          if (!e1 && made.user) userId = made.user.id;
        }
        if (!userId) {
          const { data: made, error: e2 } = await admin.auth.admin.createUser({
            email: `${wanted}.${s.id.slice(0, 4)}@players.nevorai.com`,
            password,
            email_confirm: true,
            user_metadata: meta,
          });
          if (e2 || !made.user) throw new Error(e2?.message ?? "Could not create login");
          userId = made.user.id;
        }

        const phoneE164 = s.phone ? toE164(s.phone) : null;
        if (phoneE164) {
          // Shared parent numbers can clash: the Player ID still works.
          await admin.auth.admin
            .updateUserById(userId, { phone: phoneE164, phone_confirm: true })
            .catch(() => undefined);
        }

        await joinAcademy(userId, "bulk_logins");
        const username = await saveUsername(admin, userId, wanted);

        const now = new Date().toISOString();
        const { error: upErr } = await admin
          .from("students")
          .update({
            user_id: userId,
            player_id: s.player_id ?? username.toUpperCase(),
            lifecycle_status: "activated",
            activated_at: now,
            activation_token: null,
          } as never)
          .eq("id", s.id);
        if (upErr) throw new Error(upErr.message);

        base.status = "created";
        base.username = username;
        base.playerId = s.player_id ?? username.toUpperCase();
        if (data.sendEmail && contactEmail) {
          base.emailSent = await sendCredentialsEmail({
            tenantId: data.tenantId,
            to: contactEmail,
            name: s.name,
            academy: tenant.name,
            username,
            password,
            url,
          });
        }
      } catch (e) {
        base.error = e instanceof Error ? e.message : "Failed";
      }
      return base;
    };

    // Small parallel batches: fast, but gentle on the auth service.
    for (let i = 0; i < todo.length; i += 5) {
      results.push(...(await Promise.all(todo.slice(i, i + 5).map(one))));
    }
    const skipped = (students ?? []).length - todo.length;
    return { results, skippedHaveLogin: skipped, emailConfigured, loginUrl: url, academy: tenant.name };
  });

/** New temporary password for a player who forgot theirs (owner/admin only). */
export const resetStudentLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => resetInput.parse(v))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.tenantId);
    const admin = await getAdmin();
    const { data: s } = await admin
      .from("students")
      .select("id, name, email, phone, guardian_phone, player_id, user_id")
      .eq("id", data.studentId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!s?.user_id) throw new Error("This player has no login yet. Use Create logins first.");
    // Only logins this academy made itself can be reset here. A person who signed up on their
    // own (or who has Nevorai accounts elsewhere under the same email) resets their own password.
    const { data: target } = await admin.auth.admin.getUserById(s.user_id);
    const meta = (target?.user?.user_metadata ?? {}) as { must_change_password?: unknown; tenant_id?: unknown };
    if (typeof meta.must_change_password !== "boolean" || meta.tenant_id !== data.tenantId) {
      throw new Error("This player set up their own login. Ask them to use Forgot password on the sign-in page.");
    }
    const { data: uname } = await admin
      .from("user_usernames")
      .select("username")
      .eq("user_id", s.user_id)
      .maybeSingle();
    const { data: tenant } = await admin
      .from("tenants")
      .select("name, slug, custom_domain")
      .eq("id", data.tenantId)
      .maybeSingle();
    const password = tempPassword();
    const { error } = await admin.auth.admin.updateUserById(s.user_id, {
      password,
      user_metadata: { must_change_password: true },
    });
    if (error) throw new Error(error.message);
    const username = uname?.username ?? (s.player_id ?? "").toLowerCase();
    const url = tenant ? loginUrl(tenant as { slug: string; custom_domain?: string | null }) : "";
    let emailSent = false;
    if (data.sendEmail && s.email && tenant) {
      emailSent = await sendCredentialsEmail({
        tenantId: data.tenantId,
        to: s.email,
        name: s.name,
        academy: tenant.name,
        username,
        password,
        url,
      });
    }
    return {
      name: s.name,
      username,
      playerId: s.player_id ?? username.toUpperCase(),
      password,
      phone: s.phone ?? null,
      guardianPhone: s.guardian_phone ?? null,
      emailSent,
      loginUrl: url,
      academy: tenant?.name ?? "",
    };
  });
