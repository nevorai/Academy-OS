import { describe, expect, it } from "vitest";
import { clockLabel, dailyCounts, heldDates, istMinutes, pctOf, playerStats } from "./overview";
import type { Visit } from "./calendar";

const v = (
  student_id: string,
  session_date: string,
  inIso: string | null,
  mins = 60,
  status: Visit["status"] = "present",
): Visit => ({
  student_id,
  session_date,
  status,
  check_in_at: inIso,
  check_out_at: null,
  duration_minutes: mins,
  source: null,
});

describe("attendance overview helpers", () => {
  it("reads India time and labels it", () => {
    expect(istMinutes("2026-11-11T11:32:00Z")).toBe(17 * 60 + 2);
    expect(clockLabel(17 * 60 + 2)).toBe("5:02 pm");
    expect(clockLabel(0)).toBe("12:00 am");
    expect(clockLabel(12 * 60)).toBe("12:00 pm");
  });
  const visits = [
    v("a", "2026-11-02", "2026-11-02T11:30:00Z"),
    v("b", "2026-11-02", "2026-11-02T11:40:00Z"),
    v("a", "2026-11-03", "2026-11-03T11:45:00Z"),
    v("c", "2026-11-03", null, 0, "absent"),
    v("a", "2026-11-20", "2026-11-20T11:30:00Z"),
  ];
  it("counts the days the academy ran, never future days", () => {
    expect(heldDates(visits, "2026-11-10")).toEqual(["2026-11-02", "2026-11-03"]);
  });
  it("counts different players per day, absent not counted", () => {
    expect(dailyCounts(visits, ["2026-11-02", "2026-11-03", "2026-11-04"])).toEqual([2, 1, 0]);
  });
  it("gives per-player days, average arrival and last seen", () => {
    const s = playerStats(visits).get("a")!;
    expect(s.days).toBe(3);
    expect(s.lastSeen).toBe("2026-11-20");
    expect(s.minutes).toBe(180);
    expect(playerStats(visits).has("c")).toBe(false);
  });
  it("percent is null before any day ran and capped at 100", () => {
    expect(pctOf(0, 0)).toBeNull();
    expect(pctOf(3, 4)).toBe(75);
    expect(pctOf(5, 4)).toBe(100);
  });
});
