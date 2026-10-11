/**
 * Attendance calendar: month maths, one-state-per-day rules, and the month fetchers.
 *
 * A day has ONE state for a player:
 *  - present / late: at least one visit was recorded that day (present wins over late)
 *  - absent: the player's batch had a session that day and there is no present/late visit
 *            (written absent marks and "nobody marked them" both show as absent)
 *  - none: no session that day (a holiday, a day off, or before they joined)
 * Nothing here writes to the database; marks are still made on the Attendance page.
 */
import { supabase } from "@/integrations/supabase/client";

export type DayState = "present" | "late" | "absent" | "none";

export interface MonthDay {
  /** YYYY-MM-DD in the academy's local calendar. */
  date: string;
  day: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

export interface Visit {
  student_id: string;
  session_date: string;
  status: "present" | "absent" | "late";
  check_in_at: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  source: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

export function todayISO(now = new Date()): string {
  return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Every day of a month (m0 is 0-based). */
export function monthDays(year: number, m0: number): MonthDay[] {
  const count = new Date(year, m0 + 1, 0).getDate();
  const out: MonthDay[] = [];
  for (let d = 1; d <= count; d++) {
    const wd = (new Date(year, m0, d).getDay() + 6) % 7;
    out.push({ date: isoDate(year, m0, d), day: d, weekday: wd });
  }
  return out;
}

export function shiftMonth(year: number, m0: number, delta: number): { year: number; m0: number } {
  const d = new Date(year, m0 + delta, 1);
  return { year: d.getFullYear(), m0: d.getMonth() };
}

export function monthLabel(year: number, m0: number): string {
  return new Date(year, m0, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** One state for one player on one day. */
export function dayState(visits: Visit[], sessionHeld: boolean): DayState {
  if (visits.some((v) => v.status === "present")) return "present";
  if (visits.some((v) => v.status === "late")) return "late";
  if (visits.some((v) => v.status === "absent")) return "absent";
  return sessionHeld ? "absent" : "none";
}

export interface MonthSummary {
  present: number;
  late: number;
  absent: number;
  /** Days that count: present + late + absent. */
  held: number;
  /** Whole percent, or null when nothing was held yet. */
  pct: number | null;
}

/** Counts days up to and including `today`; future days never count as absent. */
export function summarize(states: Record<string, DayState>, today: string): MonthSummary {
  let present = 0;
  let late = 0;
  let absent = 0;
  for (const [date, s] of Object.entries(states)) {
    if (date > today) continue;
    if (s === "present") present++;
    else if (s === "late") late++;
    else if (s === "absent") absent++;
  }
  const held = present + late + absent;
  return { present, late, absent, held, pct: held ? Math.round(((present + late) / held) * 100) : null };
}

/** Builds the per-day state map for one player. */
export function playerStates(
  days: MonthDay[],
  visitsByDate: Map<string, Visit[]>,
  sessionDates: Set<string>,
): Record<string, DayState> {
  const out: Record<string, DayState> = {};
  for (const d of days) {
    out[d.date] = dayState(visitsByDate.get(d.date) ?? [], sessionDates.has(d.date));
  }
  return out;
}

export function groupByStudent(visits: Visit[]): Map<string, Map<string, Visit[]>> {
  const out = new Map<string, Map<string, Visit[]>>();
  for (const v of visits) {
    const byDate = out.get(v.student_id) ?? new Map<string, Visit[]>();
    const arr = byDate.get(v.session_date) ?? [];
    arr.push(v);
    byDate.set(v.session_date, arr);
    out.set(v.student_id, byDate);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------
const PAGE = 1000;

type MarkRow = {
  student_id: string;
  status: Visit["status"];
  check_in_at: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  source: string | null;
  attendance_sessions: { session_date: string } | { session_date: string }[] | null;
};

function toVisit(r: MarkRow): Visit | null {
  const s = Array.isArray(r.attendance_sessions) ? r.attendance_sessions[0] : r.attendance_sessions;
  if (!s) return null;
  return {
    student_id: r.student_id,
    session_date: s.session_date,
    status: r.status,
    check_in_at: r.check_in_at,
    check_out_at: r.check_out_at,
    duration_minutes: r.duration_minutes,
    source: r.source,
  };
}

/** Dates on which a batch held a session in [from, to]. */
export async function fetchBatchSessionDates(
  tenantId: string,
  batchId: string,
  from: string,
  to: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("attendance_sessions")
    .select("session_date")
    .eq("tenant_id", tenantId)
    .eq("batch_id", batchId)
    .gte("session_date", from)
    .lte("session_date", to);
  return new Set((data ?? []).map((r) => r.session_date));
}

/** Visits of one batch's sessions in [from, to], every player (pages of 1000). */
export async function fetchBatchVisits(
  tenantId: string,
  batchId: string,
  from: string,
  to: string,
): Promise<Visit[]> {
  const out: Visit[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("attendance_marks")
      .select(
        "student_id, status, check_in_at, check_out_at, duration_minutes, source, attendance_sessions!inner(session_date, batch_id)",
      )
      .eq("tenant_id", tenantId)
      .is("superseded_by", null)
      .eq("attendance_sessions.batch_id", batchId)
      .gte("attendance_sessions.session_date", from)
      .lte("attendance_sessions.session_date", to)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as MarkRow[];
    for (const r of rows) {
      const v = toVisit(r);
      if (v) out.push(v);
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

/** One player's visits in [from, to]. A month is at most a few dozen rows. */
export async function fetchPlayerVisits(
  tenantId: string,
  studentId: string,
  from: string,
  to: string,
): Promise<Visit[]> {
  const { data, error } = await supabase
    .from("attendance_marks")
    .select(
      "student_id, status, check_in_at, check_out_at, duration_minutes, source, attendance_sessions!inner(session_date)",
    )
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .is("superseded_by", null)
    .gte("attendance_sessions.session_date", from)
    .lte("attendance_sessions.session_date", to)
    .limit(PAGE);
  if (error) throw error;
  return ((data ?? []) as unknown as MarkRow[]).map(toVisit).filter((v): v is Visit => v !== null);
}

export const calendarKeys = {
  player: (tenantId: string, studentId: string, from: string) =>
    ["attendance", "cal-player", tenantId, studentId, from] as const,
  batch: (tenantId: string, batchId: string, from: string) =>
    ["attendance", "cal-batch", tenantId, batchId, from] as const,
};
