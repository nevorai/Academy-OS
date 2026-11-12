import { describe, expect, it } from "vitest";
import {
  attendanceSummary,
  monthRangeIst,
  previousMonthKey,
  greetName,
  istTime,
  monthLabel,
  parentPhone,
  recipientsFor,
} from "@/lib/parent-messages.server";

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

  it("sends to both the parent's and the player's own number", () => {
    const r = recipientsFor({
      name: "Aarav",
      guardian_name: "Sharma ji",
      guardian_phone: "9876543210",
      phone: "9123456789",
    });
    expect(r).toEqual([
      { phone: "919876543210", greeting: "Sharma ji" },
      { phone: "919123456789", greeting: "Aarav" },
    ]);
  });
  it("sends once when both numbers are the same, and to the one number that exists", () => {
    expect(
      recipientsFor({
        name: "A",
        guardian_name: null,
        guardian_phone: "9876543210",
        phone: "+91 98765 43210",
      }),
    ).toHaveLength(1);
    expect(
      recipientsFor({ name: "A", guardian_name: null, guardian_phone: null, phone: "9123456789" }),
    ).toEqual([{ phone: "919123456789", greeting: "A" }]);
    expect(
      recipientsFor({ name: "A", guardian_name: null, guardian_phone: null, phone: null }),
    ).toEqual([]);
  });

  it("finds last month, including January", () => {
    expect(previousMonthKey("2026-12-02")).toBe("2026-11");
    expect(previousMonthKey("2027-01-01")).toBe("2026-12");
  });
  it("month range is India midnight to India midnight", () => {
    expect(monthRangeIst("2026-11")).toEqual({
      from: "2026-10-31T18:30:00.000Z",
      to: "2026-11-30T18:30:00.000Z",
    });
    expect(monthRangeIst("2026-12").to).toBe("2026-12-31T18:30:00.000Z");
  });
  it("counts training days and days each player came (India dates)", () => {
    const r = attendanceSummary([
      { student_id: "a", check_in_at: "2026-11-02T00:30:00Z" },
      { student_id: "a", check_in_at: "2026-11-02T10:00:00Z" }, // same India day
      { student_id: "a", check_in_at: "2026-11-03T01:00:00Z" },
      { student_id: "b", check_in_at: "2026-11-03T01:00:00Z" },
      { student_id: "b", check_in_at: "2026-11-04T01:00:00Z" },
      { student_id: "c", check_in_at: null },
    ]);
    expect(r.total).toBe(3);
    expect(r.rows.find((x) => x.studentId === "a")).toMatchObject({ came: 2, percent: 67 });
    expect(r.rows.find((x) => x.studentId === "b")).toMatchObject({ came: 2, total: 3 });
    expect(r.rows.some((x) => x.studentId === "c")).toBe(false);
  });
});
