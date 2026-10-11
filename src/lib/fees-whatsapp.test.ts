import { describe, expect, it } from "vitest";
import { receiptMessage, whatsappLink } from "./fees";

describe("fee WhatsApp helpers", () => {
  it("adds the India code to a 10-digit number", () => {
    expect(whatsappLink("98765 43210", "hi")).toBe("https://wa.me/919876543210?text=hi");
    expect(whatsappLink("+919876543210", "a b")).toBe("https://wa.me/919876543210?text=a%20b");
  });
  it("gives no link when there is no usable number", () => {
    expect(whatsappLink("", "hi")).toBeNull();
    expect(whatsappLink("123", "hi")).toBeNull();
    expect(whatsappLink(null, "hi")).toBeNull();
  });
  it("receipt text names the child, amount and how it was paid", () => {
    const t = receiptMessage({ tenantName: "Sai Sports", studentName: "Aarav", amount: 1500, period: "2026-10", method: "upi" });
    expect(t).toContain("Aarav");
    expect(t).toContain("₹1,500");
    expect(t).toContain("UPI");
    expect(t).toContain("Sai Sports");
  });
});
