import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStudent } from "@/lib/dashboard-queries";
import {
  fetchAllRemarks,
  fetchAthleteByStudent,
  fetchPlayerAttendanceSummary,
  fetchPlayerCareer,
  fetchRecentMatches,
  playerKeys,
} from "@/lib/player-profile";
import { attendanceKeys, fetchAttendanceToday } from "@/lib/attendance/queries";
import {
  fetchBatchSessionDates,
  fetchPlayerVisits,
  playerStates,
  summarize,
  todayISO,
  type Visit,
} from "@/lib/attendance/calendar";
import { lastDays } from "@/lib/students/profile-stats";

/** The player record as the detail page uses it (the table row plus the batch name). */
export type PlayerStudent = NonNullable<Awaited<ReturnType<typeof fetchStudent>>>;

/** Match rows kept for the whole page; every tab shows a slice of this one list. */
const MATCH_ROWS = 25;

/** The player, their match-centre profile and today's live attendance state. */
export function usePlayerProfile(tenantId: string, id: string) {
  const studentQ = useQuery({
    queryKey: ["d", "student", id],
    queryFn: () => fetchStudent(id),
  });
  const athleteQ = useQuery({
    enabled: !!studentQ.data,
    queryKey: playerKeys.athlete(tenantId, id),
    queryFn: () => fetchAthleteByStudent(tenantId, id),
  });
  // Live status reuses the frozen attendance_today view.
  const todayQ = useQuery({
    queryKey: attendanceKeys.today(tenantId),
    queryFn: () => fetchAttendanceToday(tenantId),
    staleTime: 15_000,
  });

  const student = (studentQ.data ?? null) as PlayerStudent | null;
  const athlete = athleteQ.data ?? null;
  const todayRow = todayQ.data?.find((r) => r.student_id === id) ?? null;
  return {
    student,
    athlete,
    athleteId: (athlete?.id as string | undefined) ?? null,
    liveState: todayRow?.current_state ?? "not_marked",
    loading: studentQ.isLoading,
  };
}

/**
 * Recent matches, newest appearance first. ONE fetch under ONE key: before this, four tabs asked
 * for 1, 6, 20 and 25 rows under the same key and the first answer was shared with the others.
 */
export function usePlayerMatches(athleteId: string | null) {
  return useQuery({
    enabled: !!athleteId,
    queryKey: playerKeys.matches(athleteId ?? "none"),
    queryFn: () => fetchRecentMatches(athleteId!, MATCH_ROWS),
    staleTime: 60_000,
  });
}

export function usePlayerCareer(athleteId: string | null) {
  return useQuery({
    enabled: !!athleteId,
    queryKey: playerKeys.career(athleteId ?? "none"),
    queryFn: () => fetchPlayerCareer(athleteId!),
    staleTime: 60_000,
  });
}

/** Every visit of the player (up to 500) and the per-day roll-up. */
export function usePlayerAttendance(tenantId: string, studentId: string) {
  return useQuery({
    queryKey: ["player", "att-summary", tenantId, studentId],
    queryFn: () => fetchPlayerAttendanceSummary(tenantId, studentId),
    staleTime: 60_000,
  });
}

/**
 * Attendance over the last 30 days, counted like the calendar: a day counts when the player's
 * batch held a session; days before joining and days with no session are left out.
 * `pct` is null when the player has no batch (there is then no way to know which days were missed).
 */
export function useRecentAttendance(
  tenantId: string,
  studentId: string,
  batchId: string | null,
  joinedAt: string | null,
) {
  const today = todayISO();
  const days = useMemo(() => lastDays(today, 30, joinedAt), [today, joinedAt]);
  const from = days[0]?.date ?? today;
  return useQuery({
    enabled: days.length > 0,
    queryKey: ["player", "att-30", tenantId, studentId, batchId, from],
    staleTime: 60_000,
    queryFn: async () => {
      const [visits, sessions] = await Promise.all([
        fetchPlayerVisits(tenantId, studentId, from, today),
        batchId
          ? fetchBatchSessionDates(tenantId, batchId, from, today)
          : Promise.resolve(new Set<string>()),
      ]);
      const byDate = new Map<string, Visit[]>();
      for (const v of visits) {
        const arr = byDate.get(v.session_date) ?? [];
        arr.push(v);
        byDate.set(v.session_date, arr);
      }
      const summary = summarize(playerStates(days, byDate, sessions), today);
      return { ...summary, pct: batchId ? summary.pct : null };
    },
  });
}

/** Coach notes for the player, newest first. */
export function usePlayerRemarks(studentId: string) {
  return useQuery({
    queryKey: playerKeys.remarks(studentId),
    queryFn: () => fetchAllRemarks(studentId),
  });
}
