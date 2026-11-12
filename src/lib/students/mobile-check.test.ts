import { describe, expect, it } from "vitest";
import { checkMobile } from "@/lib/students/mobile-check";

describe("checkMobile", () => {
  it("accepts a plain 10-digit number", () => {
    expect(checkMobile("9834658765")).toEqual({ digits: "9834658765", ok: true, message: null });
  });
  it("accepts +91, spaces, dashes and a leading 0", () => {
    expect(checkMobile("+91 98346-58765").digits).toBe("9834658765");
    expect(checkMobile("09834658765").ok).toBe(true);
  });
  it("says how many digits are missing", () => {
    const r = checkMobile("789805011");
    expect(r.ok).toBe(false);
    expect(r.message).toBe("Number is incomplete: 1 more digit needed");
    expect(checkMobile("78980").message).toContain("5 more digits");
  });
  it("asks for the number when empty and rejects too long or wrong start", () => {
    expect(checkMobile("").message).toBe("Enter the 10-digit mobile number");
    expect(checkMobile("98346587650000").ok).toBe(false);
    expect(checkMobile("1234567890").message).toContain("starts with 6, 7, 8 or 9");
  });
});
