import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BILLING_URL = () => process.env.KAIZEN_BILLING_URL || "https://billing.nevorai.com";

/**
 * Owner-only. Returns the address of billing.nevorai.com (Nevorai Kaizen) for this academy.
 * When the owner's login was made by Kaizen itself (they chose the password from an emailed link), the address carries a
 * signed one-time pass in the #fragment so they arrive signed in. Any other login (a starting password set by someone else)
 * gets the plain billing address and signs in there with an emailed link: a pass is only as trustworthy as the sign-in behind it.
 */
export const getBillingUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string; plan?: "starter" | "professional" | "enterprise" }) =>
    z
      .object({
        tenantId: z.string().uuid(),
        plan: z.enum(["starter", "professional", "enterprise"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: role, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("tenant_id", data.tenantId)
      .eq("role", "owner")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!role) throw new Error("Only the academy owner can open Billing.");

    const plain = `${BILLING_URL()}/from/academy`;
    const secret = process.env.KAIZEN_PROVISION_SECRET;
    if (!secret) return { url: BILLING_URL(), signedIn: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const user = u?.user;
    if (!user?.email || !user.email_confirmed_at || !user.app_metadata?.kaizen_owner) {
      return { url: BILLING_URL(), signedIn: false };
    }
    const { makePass } = await import("@/lib/kaizen");
    const name = String(user.user_metadata?.full_name ?? "").slice(0, 120) || user.email;
    const pass = makePass(secret, { email: user.email, name, ref: data.tenantId, plan: data.plan });
    return { url: `${plain}#t=${pass}`, signedIn: true };
  });
