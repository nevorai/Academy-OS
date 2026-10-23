import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_LIMITS, type PlanTier } from "@/lib/payments/plans";
import { slugify, type Provision } from "@/lib/kaizen";

/**
 * Database side of the Kaizen contract. Server only (service role). Every function is safe to repeat:
 * the same kaizen_subscription_id never makes a second academy or a second email.
 */

export type RunResult =
  | {
      ok: true;
      productTenantId: string;
      loginUrl: string;
      state: "active" | "suspended" | "cancelled";
      revived?: boolean;
    }
  | { ok: false; status: number; code: string; error: string };

const BASE_DOMAIN = () => process.env.PLATFORM_BASE_DOMAIN || "nevorai.com";
export const academyUrl = (slug: string) => `https://${slug}.${BASE_DOMAIN()}`;

type Db = SupabaseClient;

async function adminDb(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export async function logEvent(
  db: Db,
  e: {
    subscriptionId: string | null;
    action: string;
    ok: boolean;
    code?: string;
    tenantId?: string | null;
  },
) {
  await db.from("kaizen_events").insert({
    kaizen_subscription_id: e.subscriptionId,
    action: e.action,
    ok: e.ok,
    code: e.code ?? null,
    tenant_id: e.tenantId ?? null,
  });
}

/** A free slug: `base`, then `base-2`, `base-3` ... A reserved address is refused by the database trigger and skipped. */
async function freeSlug(db: Db, business: string): Promise<string> {
  const base = slugify(business);
  for (let i = 1; i <= 30; i++) {
    const cand = i === 1 ? base : `${base.slice(0, 36)}-${i}`;
    const { data } = await db.from("tenants").select("id").eq("slug", cand).maybeSingle();
    if (!data) return cand;
  }
  return `${base.slice(0, 30)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The auth user for an email: made fresh (random password nobody knows) or found. `welcome` = the login is brand new or never used. */
async function findOrCreateUser(
  db: Db,
  email: string,
  name: string,
): Promise<{ id: string; created: boolean; welcome: boolean }> {
  const { randomBytes } = await import("node:crypto");
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: { kaizen_owner: true },
  });
  if (!error && data.user) return { id: data.user.id, created: true, welcome: true };
  if (!/already.*(registered|exists)/i.test(error?.message ?? ""))
    throw new Error(error?.message ?? "createUser failed");
  for (let page = 1; page <= 50; page++) {
    const { data: pageData, error: listErr } = await db.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);
    const found = pageData.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      // A login a failed earlier try made and nobody has used yet still needs its welcome mail.
      return {
        id: found.id,
        created: false,
        welcome: Boolean(found.app_metadata?.kaizen_owner) && !found.last_sign_in_at,
      };
    }
    if (pageData.users.length < 200) break;
  }
  throw new Error("That email is registered but could not be located.");
}

async function makeOwner(db: Db, userId: string, tenantId: string) {
  const { joinAcademy } = await import("@/lib/auth/join.functions");
  await joinAcademy(userId, "tenant_owner");
  const del = await db.from("user_roles").delete().eq("user_id", userId).eq("tenant_id", tenantId);
  if (del.error) throw new Error(`user_roles cleanup failed: ${del.error.message}`);
  const ins = await db
    .from("user_roles")
    .insert({ user_id: userId, tenant_id: tenantId, role: "owner" });
  if (ins.error) throw new Error(`user_roles insert failed: ${ins.error.message}`);
  // The old single-row profile hint: only filled when the person has none yet (an owner of two academies keeps the first).
  const { data: prof } = await db
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prof) {
    const p = await db
      .from("profiles")
      .insert({ user_id: userId, tenant_id: tenantId, role: "owner" });
    if (p.error) throw new Error(`profiles insert failed: ${p.error.message}`);
  }
}

const esc = (v: string) =>
  v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** "Set your password" mail through Resend. False when not configured or it failed: the owner can still use "Forgot password". */
async function sendWelcome(
  db: Db,
  opts: { email: string; name: string; academy: string; slug: string },
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const base = academyUrl(opts.slug);
  const { data, error } = await db.auth.admin.generateLink({
    type: "recovery",
    email: opts.email,
    options: { redirectTo: `${base}/auth` },
  });
  const link = data?.properties?.action_link;
  if (error || !link) return false;
  const from = process.env.RESEND_FROM || "Nevorai Academy <noreply@nevorai.com>";
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px">
<h2 style="margin:0 0 8px">Welcome to Nevorai Academy</h2>
<p>Hi ${esc(opts.name || "there")}, ${esc(opts.academy)} is ready.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Set your password</a></p>
<p style="color:#555">Your academy site: <a href="${esc(base)}">${esc(base)}</a><br>Sign in later at <a href="${esc(base)}/auth">${esc(base)}/auth</a>.</p>
</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [opts.email],
        subject: `Welcome to Nevorai Academy: ${opts.academy}`,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function planFields(tier: PlanTier, limits: Provision["limits"]) {
  // Only limits that differ from the tier's own default are stored as overrides.
  const overrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(limits)) {
    if ((PLAN_LIMITS[tier] as Record<string, number | null>)[k] !== v) overrides[k] = v as number;
  }
  return { plan_tier: tier, usage_limits: overrides, subscription_status: "paid" };
}

export async function provision(p: Provision): Promise<RunResult> {
  const db = await adminDb();
  const fields = planFields(p.tier, p.limits);

  const { data: existing } = await db
    .from("kaizen_subscriptions")
    .select("tenant_id, state")
    .eq("kaizen_subscription_id", p.subscriptionId)
    .maybeSingle();

  // Repeat of a known subscription (or an upgrade/downgrade): update the plan, make nothing new.
  if (existing) {
    const { data: t } = await db
      .from("tenants")
      .select("id, slug, status")
      .eq("id", existing.tenant_id)
      .maybeSingle();
    if (!t)
      return {
        ok: false,
        status: 409,
        code: "tenant_missing",
        error: "The academy for this subscription no longer exists.",
      };
    if (existing.state === "cancelled")
      return {
        ok: false,
        status: 409,
        code: "cancelled",
        error: "This subscription was cancelled.",
      };
    const up = await db.from("tenants").update(fields).eq("id", t.id);
    if (up.error) throw new Error(up.error.message);
    await db
      .from("kaizen_subscriptions")
      .update({ plan_key: p.planKey, updated_at: new Date().toISOString() })
      .eq("kaizen_subscription_id", p.subscriptionId);
    return {
      ok: true,
      productTenantId: t.id,
      loginUrl: `${academyUrl(t.slug)}/auth`,
      state: existing.state,
    };
  }

  // The owner picked the plan inside Academy: attach it to THAT academy, make no second one.
  if (p.productTenantId) {
    const { data: t } = await db
      .from("tenants")
      .select("id, slug")
      .eq("id", p.productTenantId)
      .maybeSingle();
    if (!t)
      return {
        ok: false,
        status: 404,
        code: "unknown_tenant",
        error: "product_tenant_id is not an academy here.",
      };
    const { data: other } = await db
      .from("kaizen_subscriptions")
      .select("kaizen_subscription_id")
      .eq("tenant_id", t.id)
      .neq("state", "cancelled")
      .limit(1);
    if (other?.length)
      return {
        ok: false,
        status: 409,
        code: "already_subscribed",
        error: "This academy already has a running plan.",
      };
    const up = await db
      .from("tenants")
      .update({ ...fields, status: "active" })
      .eq("id", t.id);
    if (up.error) throw new Error(up.error.message);
    const ins = await db
      .from("kaizen_subscriptions")
      .insert({ kaizen_subscription_id: p.subscriptionId, tenant_id: t.id, plan_key: p.planKey });
    if (ins.error) throw new Error(ins.error.message);
    return {
      ok: true,
      productTenantId: t.id,
      loginUrl: `${academyUrl(t.slug)}/auth`,
      state: "active",
    };
  }

  // A person who cancelled and buys again (new subscription id, same email) gets their old academy back.
  const user = await findOrCreateUser(db, p.email, p.name);
  const { data: owned } = await db
    .from("user_roles")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("role", "owner");
  const ownedIds = (owned ?? []).map((r) => r.tenant_id as string);
  if (ownedIds.length) {
    const { data: dead } = await db
      .from("kaizen_subscriptions")
      .select("tenant_id")
      .in("tenant_id", ownedIds)
      .eq("state", "cancelled");
    const { data: live } = await db
      .from("kaizen_subscriptions")
      .select("tenant_id")
      .in("tenant_id", ownedIds)
      .neq("state", "cancelled");
    const liveSet = new Set((live ?? []).map((r) => r.tenant_id as string));
    const back = (dead ?? []).map((r) => r.tenant_id as string).find((id) => !liveSet.has(id));
    if (back) {
      const { data: t } = await db.from("tenants").select("id, slug").eq("id", back).maybeSingle();
      if (t) {
        const up = await db
          .from("tenants")
          .update({ ...fields, status: "active" })
          .eq("id", t.id);
        if (up.error) throw new Error(up.error.message);
        await db.from("kaizen_subscriptions").insert({
          kaizen_subscription_id: p.subscriptionId,
          tenant_id: t.id,
          plan_key: p.planKey,
        });
        return {
          ok: true,
          productTenantId: t.id,
          loginUrl: `${academyUrl(t.slug)}/auth`,
          state: "active",
          revived: true,
        };
      }
    }
  }

  // A brand-new academy.
  let tenantId: string | null = null;
  try {
    const slug = await freeSlug(db, p.business);
    const ins = await db
      .from("tenants")
      .insert({
        name: p.business,
        slug,
        email: p.email,
        phone: p.phone,
        whatsapp: p.phone,
        status: "active",
        features: {
          online_registration: true,
          fee_tracking: true,
          powered_by_badge: true,
          attendance: true,
        },
        ...fields,
      })
      .select("id, slug")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    tenantId = ins.data.id as string;
    await makeOwner(db, user.id, tenantId);
    const sub = await db.from("kaizen_subscriptions").insert({
      kaizen_subscription_id: p.subscriptionId,
      tenant_id: tenantId,
      plan_key: p.planKey,
    });
    if (sub.error) throw new Error(sub.error.message);
    // The welcome mail goes once, only for a login nobody has used yet; a failure never fails the call.
    if (user.welcome)
      await sendWelcome(db, {
        email: p.email,
        name: p.name,
        academy: p.business,
        slug: ins.data.slug as string,
      });
    return {
      ok: true,
      productTenantId: tenantId,
      loginUrl: `${academyUrl(ins.data.slug as string)}/auth`,
      state: "active",
    };
  } catch (e) {
    // Leave nothing half-made: a retry by Kaizen starts clean.
    if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
    throw e;
  }
}

type Action = "suspend" | "resume" | "cancel";

export async function changeState(subscriptionId: string, action: Action): Promise<RunResult> {
  const db = await adminDb();
  const { data: sub } = await db
    .from("kaizen_subscriptions")
    .select("tenant_id, state, paused_by_billing")
    .eq("kaizen_subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub)
    return {
      ok: false,
      status: 404,
      code: "unknown_subscription",
      error: "No academy for this subscription.",
    };
  const { data: t } = await db
    .from("tenants")
    .select("id, slug, status")
    .eq("id", sub.tenant_id)
    .maybeSingle();
  if (!t)
    return {
      ok: false,
      status: 409,
      code: "tenant_missing",
      error: "The academy no longer exists.",
    };
  const loginUrl = `${academyUrl(t.slug)}/auth`;
  const done = (state: "active" | "suspended" | "cancelled"): RunResult => ({
    ok: true,
    productTenantId: t.id,
    loginUrl,
    state,
  });

  if (sub.state === "cancelled") {
    if (action === "resume")
      return {
        ok: false,
        status: 409,
        code: "cancelled",
        error: "A cancelled subscription cannot be resumed.",
      };
    return done("cancelled");
  }

  let patch: Record<string, unknown>;
  let state: "active" | "suspended" | "cancelled";
  let pausedByBilling = sub.paused_by_billing as boolean;
  if (action === "resume") {
    if (sub.state === "active") return done("active");
    // Only bring back what billing paused; an academy a person paused by hand stays paused.
    patch = pausedByBilling
      ? { status: "active", subscription_status: "paid" }
      : { subscription_status: "paid" };
    state = "active";
    pausedByBilling = false;
  } else {
    if (action === "suspend" && sub.state === "suspended") return done("suspended");
    const wasActive = t.status === "active";
    pausedByBilling = sub.state === "suspended" ? pausedByBilling : wasActive;
    patch = { status: "suspended", subscription_status: "overdue" };
    state = action === "cancel" ? "cancelled" : "suspended";
    if (action === "cancel") pausedByBilling = false;
  }
  const up = await db.from("tenants").update(patch).eq("id", t.id);
  if (up.error) throw new Error(up.error.message);
  const us = await db
    .from("kaizen_subscriptions")
    .update({ state, paused_by_billing: pausedByBilling, updated_at: new Date().toISOString() })
    .eq("kaizen_subscription_id", subscriptionId);
  if (us.error) throw new Error(us.error.message);
  return done(state);
}

export { adminDb };
