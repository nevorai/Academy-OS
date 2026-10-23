import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PLAN_LIMITS, type LimitId, type PlanTier } from "@/lib/payments/plans";

/**
 * The contract with Nevorai Kaizen (billing.nevorai.com). Kaizen charges and invoices; Academy only
 * learns paid / suspended / cancelled and the plan's limits.
 *   POST /api/kaizen/provision  { kaizen_subscription_id, customer{name,business,phone,email}, plan_key, limits, product_tenant_id?, sent_at }
 *   POST /api/kaizen/suspend | resume | cancel  { kaizen_subscription_id, sent_at }
 * Every call carries X-Kaizen-Signature = hex HMAC-SHA256 of the raw body with KAIZEN_PROVISION_SECRET.
 * Pure rules here (tested in kaizen.test.ts); the database side is kaizen-run.server.ts.
 */

export const SIGNATURE_HEADER = "x-kaizen-signature";
export const MAX_BODY = 16 * 1024;
/** A call older (or later) than this is refused, so an old "suspend" can't be replayed after a "resume". */
export const SKEW_MS = 10 * 60_000;
/** The pass that opens billing.nevorai.com lives this long, and works once. */
export const PASS_SECONDS = 60;
export const PRODUCT_KEY = "academy";

export const signBody = (raw: string, secret: string) =>
  createHmac("sha256", secret).update(raw).digest("hex");

/** True only for the exact signature of this body made with this secret. A missing or short secret refuses everything. */
export function verifySignature(
  raw: string,
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const given = header
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(signBody(raw, secret)));
}

/** `sent_at` must be a recent moment (ISO text or epoch seconds/milliseconds). Missing = refused: replay safety. */
export function freshEnough(sentAt: unknown, now = Date.now()): boolean {
  let t = NaN;
  if (typeof sentAt === "number") t = sentAt < 1e11 ? sentAt * 1000 : sentAt;
  else if (typeof sentAt === "string") t = Date.parse(sentAt);
  return Number.isFinite(t) && Math.abs(now - t) <= SKEW_MS;
}

const SUB_ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

const LIMIT_IDS = Object.keys(PLAN_LIMITS.starter) as LimitId[];

/** Kaizen's plan key -> the Academy tier. A yearly plan is `<key>-yearly` and gets the monthly plan's tier. */
export function tierForPlanKey(planKey: string): PlanTier | null {
  const key = planKey.replace(/-yearly$/, "");
  if (key === "starter" || key === "professional" || key === "enterprise") return key;
  // A custom plan made for one customer starts from Professional; its own limits come in `limits`.
  if (/^custom-[a-z0-9-]{1,40}$/.test(key)) return "professional";
  return null;
}

/** Keep only limits Academy counts: whole numbers 0..10,000,000 (`null` = unlimited is not accepted from outside). */
export function cleanLimits(raw: unknown): Partial<Record<LimitId, number>> {
  const out: Partial<Record<LimitId, number>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const id of LIMIT_IDS) {
    const v = src[id];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10_000_000) out[id] = v;
  }
  return out;
}

export type Provision = {
  subscriptionId: string;
  name: string;
  business: string;
  email: string;
  phone: string | null;
  planKey: string;
  tier: PlanTier;
  limits: Partial<Record<LimitId, number>>;
  productTenantId: string | null;
};

export function parseProvision(
  body: unknown,
): { ok: true; v: Provision } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { ok: false, error: "Send JSON." };
  const b = body as Record<string, unknown>;
  const subscriptionId =
    typeof b.kaizen_subscription_id === "string" ? b.kaizen_subscription_id.trim() : "";
  if (!SUB_ID.test(subscriptionId))
    return { ok: false, error: "kaizen_subscription_id is missing or invalid." };
  const c =
    b.customer && typeof b.customer === "object" && !Array.isArray(b.customer)
      ? (b.customer as Record<string, unknown>)
      : null;
  if (!c) return { ok: false, error: "customer is missing." };
  const email = text(c.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: "customer.email is missing or invalid." };
  const name = text(c.name, 120);
  const business = text(c.business, 120) || name;
  if (!business) return { ok: false, error: "customer.business or customer.name is required." };
  const phone = text(c.phone, 30).replace(/[^\d+]/g, "") || null;
  const planKey = text(b.plan_key, 60).toLowerCase();
  const tier = tierForPlanKey(planKey);
  if (!tier) return { ok: false, error: "plan_key is not a plan Academy knows." };
  let productTenantId: string | null = null;
  if (
    b.product_tenant_id !== undefined &&
    b.product_tenant_id !== null &&
    b.product_tenant_id !== ""
  ) {
    if (typeof b.product_tenant_id !== "string" || !UUID.test(b.product_tenant_id)) {
      return { ok: false, error: "product_tenant_id is invalid." };
    }
    productTenantId = b.product_tenant_id.toLowerCase();
  }
  return {
    ok: true,
    v: {
      subscriptionId,
      name,
      business,
      email,
      phone,
      planKey,
      tier,
      limits: cleanLimits(b.limits),
      productTenantId,
    },
  };
}

export function parseSubscriptionId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const id = (body as Record<string, unknown>).kaizen_subscription_id;
  return typeof id === "string" && SUB_ID.test(id.trim()) ? id.trim() : null;
}

/** An address-safe, readable slug from a business name: lower-case letters, digits and single dashes, 3..40 characters. */
export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return s.length >= 3 ? s : `academy-${s || "new"}`.slice(0, 40);
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/**
 * The Billing pass: base64url(claims).base64url(HMAC-SHA256(secret, base64url(claims))).
 * Claims {v:1, p, email, ref, name, iat, exp, jti}; lives PASS_SECONDS; Kaizen accepts it once.
 */
export function makePass(
  secret: string,
  who: { email: string; name: string; ref: string; plan?: string },
  nowMs = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const claims: Record<string, unknown> = {
    v: 1,
    p: PRODUCT_KEY,
    email: who.email.toLowerCase(),
    ref: who.ref,
    name: who.name,
    iat,
    exp: iat + PASS_SECONDS,
    jti: randomBytes(16).toString("hex"),
  };
  if (who.plan) claims.plan = who.plan;
  const body = b64u(JSON.stringify(claims));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}
