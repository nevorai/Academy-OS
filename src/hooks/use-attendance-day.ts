/**
 * Everything the owner/coach Attendance screen needs for one day: the three
 * queries, the derived roster groups and numbers, and the check-in/out
 * actions. The screen itself only lays this out.
 *
 * All summary values are DERIVED from the shared attendance lifecycle
 * (append-only history + attendance_today view). No new writes, no new
 * tables; it reuses the same queries and realtime channel as the dashboard
 * KPIs, the student app, the parent portal and reports.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, startOfDay } from "date-fns";
import { toast } from "sonner";
import { useDashboard } from "@/lib/dashboard-context";
import { fetchBatches, fetchStudents, qk } from "@/lib/dashboard-queries";
import { usePermissions } from "@/hooks/use-permissions";
import { supabase } from "@/integrations/supabase/client";
import {
  attendanceKeys,
  fetchAttendanceByDate,
  fetchAttendanceToday,
  useAttendanceRealtime,
  useCheckIn,
  useCheckOut,
} from "@/lib/attendance/queries";
import type { AttendanceState } from "@/lib/attendance/constants";
import {
  LATE_GRACE_MS,
  batchMatchesSession,
  normalize,
  parseBatchStartMs,
  type RosterTab,
  type SessionFilter,
  type StudentLite,
  type TodayRow,
} from "@/lib/attendance/roster";

// Owner/Admin preferences, persisted per device.
const QUICK_MODE_KEY = "academyos.attendance.quickMode";
const ROSTER_TAB_KEY = "academyos.attendance.rosterTab";

// The session filter has no control on screen yet; the roster always shows
// every active batch. Kept as a value so the filter helpers stay wired in.
const SESSION: SessionFilter = "all";

type RosterStudent = StudentLite & {
  status: string;
  phone: string | null;
  guardian_phone: string | null;
};

type BatchLite = { id: string; name: string; active: boolean; timing: string | null };

export function useAttendanceDay() {
  const { tenant } = useDashboard();
  const qc = useQueryClient();
  const { can, isLoading: permLoading } = usePermissions();
  const canMark = can("canMarkAttendance");

  const [query, setQuery] = useState("");
  const [quickMode, setQuickMode] = useState<boolean>(false);
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [rosterTab, setRosterTab] = useState<RosterTab>("waiting");
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));

  const isTodayView = isToday(selectedDate);
  const selectedISO = format(selectedDate, "yyyy-MM-dd");
  const historyMode = !isTodayView;

  useEffect(() => {
    try {
      setQuickMode(localStorage.getItem(QUICK_MODE_KEY) === "1");
      const t = localStorage.getItem(ROSTER_TAB_KEY);
      if (t === "waiting" || t === "present" || t === "done") setRosterTab(t);
    } catch {
      /* ignore */
    }

    // Trigger daily cleanup once per dashboard load for administrators.
    // This ensures yesterday's open sessions are closed and marked as Auto (0h).
    if (canMark) {
      supabase.rpc("process_daily_attendance_cleanup").then(({ error }) => {
        if (error) console.error("Cleanup error:", error);
      });
    }
  }, [canMark]);

  // Daily lifecycle: when the local calendar date rolls over (tab left open
  // across midnight), advance `selectedDate` so the roster resets to today's
  // fresh Waiting state instead of pinning yesterday as "history".
  useEffect(() => {
    if (!isTodayView) return;
    const tick = () => {
      const now = startOfDay(new Date());
      if (now.getTime() !== startOfDay(selectedDate).getTime()) {
        setSelectedDate(now);
        qc.invalidateQueries({ queryKey: attendanceKeys.today(tenant.id) });
      }
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [isTodayView, selectedDate, qc, tenant.id]);

  const toggleQuick = useCallback(() => {
    setQuickMode((v) => {
      const next = !v;
      try {
        localStorage.setItem(QUICK_MODE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const changeRosterTab = useCallback((t: RosterTab) => {
    setRosterTab(t);
    try {
      localStorage.setItem(ROSTER_TAB_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const batchesQ = useQuery({
    queryKey: qk.batches(tenant.id),
    queryFn: () => fetchBatches(tenant.id),
  });
  const studentsQ = useQuery({
    queryKey: qk.students(tenant.id),
    queryFn: () => fetchStudents(tenant.id),
  });
  const todayQ = useQuery({
    queryKey: attendanceKeys.today(tenant.id),
    queryFn: () => fetchAttendanceToday(tenant.id),
    staleTime: 15_000,
    enabled: isTodayView,
  });
  const historyQ = useQuery({
    queryKey: attendanceKeys.byDate(tenant.id, selectedISO),
    queryFn: () => fetchAttendanceByDate(tenant.id, selectedISO),
    // Historical days are immutable, so cache aggressively: re-selecting
    // yesterday doesn't re-fetch.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: historyMode,
  });
  const attendanceQ = isTodayView ? todayQ : historyQ;

  // Single realtime subscription updates every card + list on this page.
  // Only subscribe when viewing Today; historical days are frozen.
  useAttendanceRealtime(isTodayView ? tenant.id : null, qc);

  const activeBatches = useMemo(
    () => ((batchesQ.data ?? []) as BatchLite[]).filter((b) => b.active),
    [batchesQ.data],
  );
  const sessionBatchIds = useMemo(
    () =>
      new Set(activeBatches.filter((b) => batchMatchesSession(b.timing, SESSION)).map((b) => b.id)),
    [activeBatches],
  );
  const batchNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of activeBatches) m.set(b.id, b.name);
    return m;
  }, [activeBatches]);
  // Late thresholds per batch (ms) for the SELECTED day: derived, not stored.
  const batchLateThresholdById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const b of activeBatches) {
      const start = parseBatchStartMs(b.timing, selectedISO);
      m.set(b.id, start == null ? null : start + LATE_GRACE_MS);
    }
    return m;
  }, [activeBatches, selectedISO]);

  // Students in the session (all matching batches), then filtered by search.
  const rosterStudents = useMemo(() => {
    const q = normalize(query);
    return ((studentsQ.data ?? []) as RosterStudent[]).filter((s) => {
      if (s.status !== "active") return false;
      if (!s.batch_id || !sessionBatchIds.has(s.batch_id)) return false;
      if (!q) return true;
      const hay = [s.name, s.player_id, s.phone, s.guardian_phone].map(normalize).join(" ");
      return hay.includes(q);
    });
  }, [studentsQ.data, sessionBatchIds, query]);

  // student_id → derived attendance row for the SELECTED date.
  const stateByStudent = useMemo(() => {
    const m = new Map<string, TodayRow>();
    for (const row of attendanceQ.data ?? []) {
      if (row.batch_id && sessionBatchIds.has(row.batch_id))
        m.set(row.student_id, row as unknown as TodayRow);
    }
    return m;
  }, [attendanceQ.data, sessionBatchIds]);

  // Everything derived, never stored.
  const kpis = useMemo(() => {
    let inAcademy = 0;
    let checkedOutToday = 0;
    let late = 0;
    for (const s of rosterStudents) {
      const row = stateByStudent.get(s.id);
      const state: AttendanceState = row?.current_state ?? "not_marked";
      if (state === "in_academy") inAcademy++;
      else if (state === "checked_out") checkedOutToday++;
      else continue;
      const threshold = s.batch_id ? batchLateThresholdById.get(s.batch_id) : null;
      if (row?.check_in_at && threshold != null && new Date(row.check_in_at).getTime() > threshold)
        late++;
    }
    const present = inAcademy + checkedOutToday;
    const total = rosterStudents.length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { inAcademy, present, checkedOutToday, late, notArrived: total - present, total, pct };
  }, [rosterStudents, stateByStudent, batchLateThresholdById]);

  // Grouped roster: Waiting / Present / Checked Out.
  const groups = useMemo(() => {
    const waiting: RosterStudent[] = [];
    const present: RosterStudent[] = [];
    const done: RosterStudent[] = [];
    for (const s of rosterStudents) {
      const state: AttendanceState = stateByStudent.get(s.id)?.current_state ?? "not_marked";
      if (state === "in_academy") present.push(s);
      else if (state === "checked_out") done.push(s);
      else waiting.push(s);
    }
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    waiting.sort(byName);
    done.sort(byName);
    present.sort((a, b) => {
      const ta = stateByStudent.get(a.id)?.check_in_at ?? "";
      const tb = stateByStudent.get(b.id)?.check_in_at ?? "";
      return ta.localeCompare(tb) || byName(a, b);
    });
    return { waiting, present, done };
  }, [rosterStudents, stateByStudent]);

  // Undo helpers reuse the existing schema. Undo check-in removes the row
  // (only safe because we just created it and it's still the active row);
  // undo check-out clears the check_out_at timestamp on the same row.
  const undoCheckIn = useCallback(
    async (markId: string) => {
      const { error } = await supabase.from("attendance_marks").delete().eq("id", markId);
      if (error) {
        toast.error(error.message);
        return;
      }
      qc.invalidateQueries({ queryKey: attendanceKeys.today(tenant.id) });
    },
    [qc, tenant.id],
  );
  const undoCheckOut = useCallback(
    async (markId: string) => {
      const { error } = await supabase
        .from("attendance_marks")
        .update({ check_out_at: null, check_out_meta: {} })
        .eq("id", markId);
      if (error) {
        toast.error(error.message);
        return;
      }
      qc.invalidateQueries({ queryKey: attendanceKeys.today(tenant.id) });
    },
    [qc, tenant.id],
  );

  // Quick mode: after a successful check-in, scroll & flash the next waiting
  // row so the coach can just keep tapping.
  const rosterRef = useRef<HTMLDivElement>(null);
  const focusNextWaiting = useCallback(
    (afterStudentId: string) => {
      if (!quickMode) return;
      const container = rosterRef.current;
      if (!container) return;
      const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-waiting="1"]'));
      const idx = rows.findIndex((el) => el.dataset.studentId === afterStudentId);
      const next = rows[idx + 1] ?? rows.find((el) => el.dataset.studentId !== afterStudentId);
      if (next) {
        next.scrollIntoView({ behavior: "smooth", block: "center" });
        next.classList.add("ring-2", "ring-primary/40");
        window.setTimeout(() => next.classList.remove("ring-2", "ring-primary/40"), 900);
      }
    },
    [quickMode],
  );

  // Bulk actions run the plain check-in/out mutations in parallel.
  const checkIn = useCheckIn();
  const checkOut = useCheckOut(tenant.id);

  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleSelectMode = useCallback(() => {
    setSelectMode((v) => !v);
    setSelected(new Set());
  }, []);

  const bulkCheckIn = async () => {
    const items = groups.waiting.filter((s) => selected.has(s.id) && s.batch_id);
    if (items.length === 0) {
      toast.error("Select waiting students first");
      return;
    }
    await Promise.allSettled(
      items.map((s) =>
        checkIn.mutateAsync({ tenantId: tenant.id, batchId: s.batch_id!, studentId: s.id }),
      ),
    );
    toast.success(`Checked in ${items.length}`);
    clearSelection();
  };
  const bulkCheckOut = async () => {
    const items = groups.present.filter((s) => selected.has(s.id));
    if (items.length === 0) {
      toast.error("Select present students first");
      return;
    }
    await Promise.allSettled(
      items.map((s) => {
        const mark = stateByStudent.get(s.id);
        return mark ? checkOut.mutateAsync({ markId: mark.mark_id }) : Promise.resolve();
      }),
    );
    toast.success(`Checked out ${items.length}`);
    clearSelection();
  };
  const markAllWaitingPresent = async () => {
    if (groups.waiting.length === 0) {
      toast.error("Nobody is waiting");
      return;
    }
    // Single-confirm gate: the only guarded action.
    const ok = window.confirm(`Mark all ${groups.waiting.length} waiting students as present?`);
    if (!ok) return;
    await Promise.allSettled(
      groups.waiting.map((s) =>
        s.batch_id
          ? checkIn.mutateAsync({ tenantId: tenant.id, batchId: s.batch_id, studentId: s.id })
          : Promise.resolve(),
      ),
    );
    toast.success(`Marked ${groups.waiting.length} present`);
    clearSelection();
  };

  // Loading only when we have NO cached data yet: avoids a skeleton flash on
  // background refetches and when switching to a previously-viewed date.
  const isLoading =
    (batchesQ.isLoading && !batchesQ.data) ||
    (studentsQ.isLoading && !studentsQ.data) ||
    (attendanceQ.isLoading && !attendanceQ.data);

  // A query that errored AND has no cached data blocks the page; a partial
  // failure shows a small retry strip while the rest keeps working.
  const failedQueries = useMemo(() => {
    const items: Array<{ key: string; label: string; refetch: () => void }> = [];
    if (batchesQ.isError && !batchesQ.data)
      items.push({ key: "batches", label: "batches", refetch: () => batchesQ.refetch() });
    if (studentsQ.isError && !studentsQ.data)
      items.push({ key: "students", label: "students", refetch: () => studentsQ.refetch() });
    if (attendanceQ.isError && !attendanceQ.data)
      items.push({
        key: "attendance",
        label: isTodayView ? "today's attendance" : "attendance",
        refetch: () => attendanceQ.refetch(),
      });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    batchesQ.isError,
    batchesQ.data,
    studentsQ.isError,
    studentsQ.data,
    attendanceQ.isError,
    attendanceQ.data,
    isTodayView,
  ]);
  const hardFailure =
    failedQueries.length > 0 && !batchesQ.data && !studentsQ.data && !attendanceQ.data;
  const partialFailure = failedQueries.length > 0 && !hardFailure;

  useEffect(() => {
    if (batchesQ.error) console.error("[attendance] batchesQ failed:", batchesQ.error);
    if (studentsQ.error) console.error("[attendance] studentsQ failed:", studentsQ.error);
    if (attendanceQ.error) console.error("[attendance] attendanceQ failed:", attendanceQ.error);
  }, [batchesQ.error, studentsQ.error, attendanceQ.error]);

  const retryAll = () => {
    batchesQ.refetch();
    studentsQ.refetch();
    attendanceQ.refetch();
  };

  return {
    tenantId: tenant.id,
    canMark,
    permLoading,
    // day
    selectedDate,
    setSelectedDate,
    selectedISO,
    isTodayView,
    historyMode,
    // view state
    query,
    setQuery,
    quickMode,
    toggleQuick,
    selectMode,
    toggleSelectMode,
    selected,
    toggleSelected,
    rosterTab,
    changeRosterTab,
    // data
    activeBatches,
    batchNameById,
    batchLateThresholdById,
    rosterStudents,
    stateByStudent,
    kpis,
    groups,
    attendanceRows: attendanceQ.data,
    attendanceLoading: attendanceQ.isLoading,
    // status
    isLoading,
    failedQueries,
    hardFailure,
    partialFailure,
    retryAll,
    // actions
    undoCheckIn,
    undoCheckOut,
    focusNextWaiting,
    rosterRef,
    bulkCheckIn,
    bulkCheckOut,
    markAllWaitingPresent,
    refreshToday: () => qc.invalidateQueries({ queryKey: attendanceKeys.today(tenant.id) }),
  };
}
