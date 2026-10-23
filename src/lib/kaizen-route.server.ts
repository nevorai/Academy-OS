import {
  MAX_BODY,
  SIGNATURE_HEADER,
  freshEnough,
  parseProvision,
  parseSubscriptionId,
  verifySignature,
} from "@/lib/kaizen";
import { adminDb, changeState, logEvent, provision, type RunResult } from "@/lib/kaizen-run.server";

type Action = "provision" | "suspend" | "resume" | "cancel";

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** One handler for the four calls: size, signature, freshness, then the action. Every outcome is logged. */
export async function handleKaizen(request: Request, action: Action): Promise<Response> {
  const secret = process.env.KAIZEN_PROVISION_SECRET;
  if (!secret)
    return json(503, {
      ok: false,
      code: "not_configured",
      error: "Billing is not set up here yet.",
    });

  const raw = await request.text();
  if (raw.length > MAX_BODY)
    return json(413, { ok: false, code: "too_big", error: "Body too large." });
  if (!verifySignature(raw, request.headers.get(SIGNATURE_HEADER), secret)) {
    return json(401, { ok: false, code: "bad_signature", error: "Bad signature." });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, code: "bad_request", error: "Send JSON." });
  }
  if (!freshEnough((body as { sent_at?: unknown } | null)?.sent_at)) {
    return json(400, { ok: false, code: "stale", error: "sent_at is missing or too old." });
  }

  let subId: string | null = null;
  let result: RunResult;
  try {
    if (action === "provision") {
      const parsed = parseProvision(body);
      if (!parsed.ok) return json(400, { ok: false, code: "bad_request", error: parsed.error });
      subId = parsed.v.subscriptionId;
      result = await provision(parsed.v);
    } else {
      subId = parseSubscriptionId(body);
      if (!subId)
        return json(400, {
          ok: false,
          code: "bad_request",
          error: "kaizen_subscription_id is missing or invalid.",
        });
      result = await changeState(subId, action);
    }
  } catch (e) {
    console.error("kaizen", action, e instanceof Error ? e.message : e);
    try {
      await logEvent(await adminDb(), {
        subscriptionId: subId,
        action,
        ok: false,
        code: "server_error",
      });
    } catch {
      /* logging must never hide the real answer */
    }
    // Kaizen retries on a 5xx; nothing half-made is left behind.
    return json(500, {
      ok: false,
      code: "server_error",
      error: "Could not complete this. Try again.",
    });
  }

  try {
    await logEvent(await adminDb(), {
      subscriptionId: subId,
      action,
      ok: result.ok,
      code: result.ok ? undefined : result.code,
      tenantId: result.ok ? result.productTenantId : null,
    });
  } catch {
    /* a missing log row never fails the call */
  }

  if (!result.ok) return json(result.status, { ok: false, code: result.code, error: result.error });
  return json(200, {
    ok: true,
    product_tenant_id: result.productTenantId,
    login_url: result.loginUrl,
    state: result.state,
    ...(result.revived ? { revived: true } : {}),
  });
}
