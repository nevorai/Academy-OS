import { describe, expect, it } from "vitest";
import {
  dayRows,
  dayState,
  groupByStudent,
  monthDays,
  playerStates,
  shiftMonth,
  summarize,
  sundayLead,
  type Visit,
} from "./calendar";

const v = (status: Visit["status"], date = "2026-10-05", student = "s1"): Visit => ({
  student_id: student,
  session_date: date,
  status,
  check_in_at: null,
  check_out_at: null,
  duration_minutes: null,
  source: "manual",
});

describe("attendance calendar", () => {
  it("lists every day of the month and starts weeks on Monday", () => {
    const days = monthDays(2026, 9); // October 2026
    expect(days).toHaveLength(31);
    expect(days[0]).toMatchObject({ date: "2026-10-01", weekday: 3 }); // Thursday
    expect(monthDays(2028, 1)).toHaveLength(29);
  });

  it("moves between months across a year edge", () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, m0: 11 });
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, m0: 0 });
  });

  it("a day is present when any visit is present, late when only late", () => {
    expect(dayState([v("absent"), v("present")], true)).toBe("present");
    expect(dayState([v("late")], true)).toBe("late");
  });

  it("no mark on a session day counts as absent; no session means no state", () => {
    expect(dayState([], true)).toBe("absent");
    expect(dayState([], false)).toBe("none");
    expect(dayState([v("absent")], false)).toBe("absent");
  });

  it("summary ignores future days and gives whole percent", () => {
    const days = monthDays(2026, 9);
    const visits = new Map([
      ["2026-10-05", [v("present", "2026-10-05")]],
      ["2026-10-06", [v("late", "2026-10-06")]],
    ]);
    const sessions = new Set(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-20"]);
    const states = playerStates(days, visits, sessions);
    const s = summarize(states, "2026-10-08");
    expect(s).toMatchObject({ present: 1, late: 1, absent: 2, held: 4, pct: 50 });
    expect(summarize({}, "2026-10-08").pct).toBeNull();
  });

  it("groups visits by player then by date", () => {
    const g = groupByStudent([v("present", "2026-10-05", "a"), v("late", "2026-10-06", "a"), v("absent", "2026-10-05", "b")]);
    expect(g.get("a")?.size).toBe(2);
    expect(g.get("b")?.get("2026-10-05")).toHaveLength(1);
  });

  it("starts the week on Sunday for the calendar grid", () => {
    expect(sundayLead(2026, 9)).toBe(4); // 1 Oct 2026 is a Thursday: Sun Mon Tue Wed blank
    expect(sundayLead(2026, 10)).toBe(0); // 1 Nov 2026 is a Sunday
  });

  it("builds the table: newest first, no future days, no days without a session", () => {
    const days = monthDays(2026, 9);
    const timed = (date: string, status: Visit["status"], inAt: string | null, outAt: string | null, mins: number | null): Visit => ({
      ...v(status, date),
      check_in_at: inAt,
      check_out_at: outAt,
      duration_minutes: mins,
    });
    const visits = [
      timed("2026-10-05", "present", "2026-10-05T11:30:00Z", "2026-10-05T13:00:00Z", 90),
      timed("2026-10-06", "late", "2026-10-06T11:50:00Z", null, null),
    ];
    const byDate = new Map<string, Visit[]>();
    for (const x of visits) byDate.set(x.session_date, [...(byDate.get(x.session_date) ?? []), x]);
    const sessions = new Set(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-20"]);
    const states = playerStates(days, byDate, sessions);
    const rows = dayRows(days, states, byDate, "2026-10-07");
    expect(rows.map((r) => r.date)).toEqual(["2026-10-07", "2026-10-06", "2026-10-05"]);
    expect(rows[0]).toMatchObject({ state: "absent", inAt: null, open: false, minutes: null });
    expect(rows[1]).toMatchObject({ state: "late", open: true, outAt: null });
    expect(rows[2]).toMatchObject({ state: "present", open: false, minutes: 90 });
  });
});
