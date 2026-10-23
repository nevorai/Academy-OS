import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, resolveLimit } from "@/lib/payments/plans";

describe("send allowances", () => {
  it("every plan has a finite monthly allowance for WhatsApp, e-mail and AI", () => {
    for (const tier of ["starter", "professional", "enterprise"] as const) {
      for (const id of ["whatsapp_messages", "emails", "ai_messages"] as const) {
        const v = PLAN_LIMITS[tier][id];
        expect(typeof v).toBe("number");
        expect(v as number).toBeGreaterThan(0);
      }
    }
  });
  it("grows with the plan", () => {
    for (const id of ["whatsapp_messages", "emails", "ai_messages"] as const) {
      expect(PLAN_LIMITS.professional[id] as number).toBeGreaterThan(
        PLAN_LIMITS.starter[id] as number,
      );
      expect(PLAN_LIMITS.enterprise[id] as number).toBeGreaterThan(
        PLAN_LIMITS.professional[id] as number,
      );
    }
  });
  it("a per-academy override wins", () => {
    expect(resolveLimit("starter", "whatsapp_messages", { whatsapp_messages: 50 })).toBe(50);
  });
});
