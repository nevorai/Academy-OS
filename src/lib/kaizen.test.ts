import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  cleanLimits,
  freshEnough,
  makePass,
  parseProvision,
  parseSubscriptionId,
  signBody,
  slugify,
  tierForPlanKey,
  verifySignature,
} from "./kaizen";

const S = "x".repeat(40);
const body = (o: Record<string, unknown> = {}) => ({
  kaizen_subscription_id: "sub_1",
  customer: {
    name: "Ravi Kumar",
    business: "Ravi Cricket Academy",
    phone: "+91 98765-43210",
    email: "Ravi@Example.com",
  },
  plan_key: "professional",
  limits: { students: 800, bogus: 5, coaches: -1, staff: 2.5 },
  sent_at: new Date().toISOString(),
  ...o,
});

describe("signature", () => {
  it("accepts the exact signature only", () => {
    const raw = JSON.stringify(body());
    expect(verifySignature(raw, signBody(raw, S), S)).toBe(true);
    expect(verifySignature(raw + " ", signBody(raw, S), S)).toBe(false);
    expect(verifySignature(raw, signBody(raw, "y".repeat(40)), S)).toBe(false);
    expect(verifySignature(raw, null, S)).toBe(false);
    expect(verifySignature(raw, signBody(raw, S), undefined)).toBe(false);
    expect(verifySignature(raw, signBody(raw, "short"), "short")).toBe(false);
  });
});

describe("freshEnough", () => {
  it("needs a recent sent_at", () => {
    expect(freshEnough(new Date().toISOString())).toBe(true);
    expect(freshEnough(new Date(Date.now() - 11 * 60_000).toISOString())).toBe(false);
    expect(freshEnough(undefined)).toBe(false);
    expect(freshEnough("nonsense")).toBe(false);
  });
});

describe("parseProvision", () => {
  it("reads a good call and cleans it", () => {
    const r = parseProvision(body());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.v.email).toBe("ravi@example.com");
      expect(r.v.phone).toBe("+919876543210");
      expect(r.v.tier).toBe("professional");
      expect(r.v.limits).toEqual({ students: 800 });
    }
  });
  it("refuses bad input", () => {
    expect(parseProvision(null).ok).toBe(false);
    expect(parseProvision(body({ kaizen_subscription_id: "a b" })).ok).toBe(false);
    expect(parseProvision(body({ customer: { business: "X", email: "nope" } })).ok).toBe(false);
    expect(parseProvision(body({ plan_key: "gold" })).ok).toBe(false);
    expect(parseProvision(body({ product_tenant_id: "not-a-uuid" })).ok).toBe(false);
  });
  it("accepts a product_tenant_id and a yearly key", () => {
    const r = parseProvision(
      body({
        plan_key: "starter-yearly",
        product_tenant_id: "0b9f3a52-6f55-4c3a-9d5e-2f1f6a3d8c11",
      }),
    );
    expect(
      r.ok &&
        r.v.tier === "starter" &&
        r.v.productTenantId === "0b9f3a52-6f55-4c3a-9d5e-2f1f6a3d8c11",
    ).toBe(true);
  });
});

describe("helpers", () => {
  it("maps plans", () => {
    expect(tierForPlanKey("enterprise-yearly")).toBe("enterprise");
    expect(tierForPlanKey("custom-sai-sports")).toBe("professional");
    expect(tierForPlanKey("x")).toBeNull();
  });
  it("cleans limits", () => {
    expect(cleanLimits({ students: 10, parents: "5", storage_mb: 1e9 })).toEqual({ students: 10 });
    expect(cleanLimits([1])).toEqual({});
  });
  it("makes a clean slug", () => {
    expect(slugify("Sai Sports Academy!")).toBe("sai-sports-academy");
    expect(slugify("  Café & Gym  ")).toBe("cafe-and-gym");
    expect(slugify("A")).toMatch(/^academy-/);
    expect(slugify("x".repeat(80)).length).toBeLessThanOrEqual(40);
  });
  it("reads a subscription id", () => {
    expect(parseSubscriptionId({ kaizen_subscription_id: "sub_9" })).toBe("sub_9");
    expect(parseSubscriptionId({})).toBeNull();
  });
});

describe("pass", () => {
  it("is signed, short-lived, and carries the claims", () => {
    const p = makePass(
      S,
      { email: "A@B.com", name: "A", ref: "r1", plan: "starter" },
      1_000_000_000_000,
    );
    const [b, sig] = p.split(".");
    expect(sig).toBe(createHmac("sha256", S).update(b).digest("base64url"));
    const c = JSON.parse(Buffer.from(b, "base64url").toString());
    expect(c).toMatchObject({ v: 1, p: "academy", email: "a@b.com", ref: "r1", plan: "starter" });
    expect(c.exp - c.iat).toBeLessThanOrEqual(120);
    expect(makePass(S, { email: "a@b.com", name: "A", ref: "r1" }).split(".")[0]).not.toBe(b);
  });
});
