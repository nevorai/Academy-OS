import { describe, expect, it } from "vitest";
import { greetName, istTime, monthLabel, parentPhone } from "@/lib/parent-messages.server";

describe("parent messages helpers", () => {
  it("adds 91 to a 10-digit number and strips symbols", () => {
    expect(parentPhone("98765 43210")).toBe("919876543210");
    expect(parentPhone("+91 98765-43210")).toBe("919876543210");
  });
  it("rejects missing or too-short numbers", () => {
    expect(parentPhone(null)).toBeNull();
    expect(parentPhone("12345")).toBeNull();
  });
  it("formats month and India time", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
    expect(istTime("2026-11-11T11:30:00Z")).toBe("5:00 pm");
  });
  it("falls back to Parent when there is no guardian name", () => {
    expect(greetName({ guardian_name: "  " })).toBe("Parent");
    expect(greetName({ guardian_name: "Sharma ji" })).toBe("Sharma ji");
  });
});
