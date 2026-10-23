import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLimit, resolvePlanTier, type LimitId } from "@/lib/payments/plans";

/**
 * Monthly per-academy allowance for the things that cost Nevorai money to send: WhatsApp, e-mail, AI.
 * The cap comes from the academy's plan (plans.ts) unless Nevorai set an override for that academy.
 * `consumeUsage` asks the database BEFORE the send; one atomic statement (academy.consume_usage), so two
 * sends at the same moment can never pass the cap together. Server only.
 */
export type UsageKind = "whatsapp" | "email" | "ai";

const LIMIT_FOR: Record<UsageKind, LimitId> = {
  whatsapp: "whatsapp_messages",
  email: "emails",
  ai: "ai_messages",
};

export const CAP_WORDS: Record<UsageKind, string> = {
  whatsapp: "WhatsApp messages",
  email: "emails",
  ai: "Kaizen messages",
};

export type CapResult = { ok: true } | { ok: false; reason: "cap" | "error"; cap?: number | null };

export async function consumeUsage(tenantId: string, kind: UsageKind, n = 1): Promise<CapResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient;
    const { data: t, error } = await db
      .from("tenants")
      .select("plan_tier, subscription_status, usage_limits")
      .eq("id", tenantId)
      .maybeSingle();
    if (error || !t) return { ok: false, reason: "error" };
    const plan = resolvePlanTier({
      plan_tier: t.plan_tier,
      subscription_status: t.subscription_status,
    });
    const cap = resolveLimit(plan, LIMIT_FOR[kind], t.usage_limits as never);
    const { data, error: rpcErr } = await db.rpc("consume_usage", {
      _tenant: tenantId,
      _kind: kind,
      _n: n,
      _cap: cap,
    });
    // Fails CLOSED: a cost cap that opens when the database blips is not a cap.
    if (rpcErr) return { ok: false, reason: "error" };
    return data === true ? { ok: true } : { ok: false, reason: "cap", cap };
  } catch {
    return { ok: false, reason: "error" };
  }
}
