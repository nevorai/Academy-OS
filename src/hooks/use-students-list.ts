/**
 * Players screen: its data, the chosen filters and the numbers shown on it.
 *
 * The page and the pieces in `components/students` only lay things out. The
 * rules for who passes a filter live in `lib/students/filters` (tested there).
 * Players, batches, this cycle's payments and a coach's own batches are asked
 * for together, so the page opens in one round of requests.
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchBatches, fetchPaymentsForPeriods, fetchStudents, qk } from "@/lib/dashboard-queries";
import { fetchMyBatches, type MyBatch } from "@/lib/coach/queries";
import { candidatePeriods, periodKey, tenantFeeCycle } from "@/lib/fees";
import { exportStudents } from "@/lib/students-manage";
import {
  PANEL_FILTERS_OFF,
  activeFilterCount,
  countByStatus,
  defaultFilters,
  filterStudents,
  joinYearsOf,
  type StudentFilters,
} from "@/lib/students/filters";

export type StudentRow = Awaited<ReturnType<typeof fetchStudents>>[number];
export type BatchRow = Awaited<ReturnType<typeof fetchBatches>>[number];

const NO_STUDENTS: StudentRow[] = [];
const NO_BATCHES: BatchRow[] = [];

export function useStudentsList(initialStatus: string) {
  const { tenant } = useDashboard();
  const qc = useQueryClient();
  const tenantId = tenant.id;

  const [filters, setFilters] = useState<StudentFilters>(() => defaultFilters(initialStatus));
  const setFilter = useCallback(
    <K extends keyof StudentFilters>(key: K, value: StudentFilters[K]) =>
      setFilters((f) => ({ ...f, [key]: value })),
    [],
  );
  /** Switches the filters panel off. Search and the status tab stay as they are. */
  const clearPanelFilters = useCallback(
    () => setFilters((f) => ({ ...f, ...PANEL_FILTERS_OFF })),
    [],
  );

  // Coaches open on their own batches; owners and admins never see the switch.
  // A coach's role can arrive a moment after the page (it is asked from the
  // server), so the switch follows the role until the coach touches it.
  const perms = usePermissions();
  const isAnyCoach = perms.isCoach || perms.isHeadCoach || perms.isAssistantCoach;
  const [myBatchesChoice, setMyBatchesOnly] = useState<boolean | null>(null);
  const myBatchesOnly = myBatchesChoice ?? isAnyCoach;
  // "Delete All" is offered only to the people the server lets run it (owner, admin).
  const canDeleteArchived = ["owner", "admin", "platform_admin"].includes(perms.role);
  const myBatchesQ = useQuery({
    enabled: isAnyCoach,
    queryKey: ["coach", "my-batches", tenantId],
    queryFn: fetchMyBatches,
    staleTime: 60_000,
  });
  const myBatchIds = useMemo(
    () => new Set(((myBatchesQ.data ?? []) as MyBatch[]).map((b) => b.batch_id)),
    [myBatchesQ.data],
  );

  const studentsQ = useQuery({
    queryKey: qk.students(tenantId),
    queryFn: () => fetchStudents(tenantId),
  });
  const batchesQ = useQuery({
    queryKey: qk.batches(tenantId),
    queryFn: () => fetchBatches(tenantId),
  });

  // Who has paid for the current cycle (the Paid / Due pill on each row).
  const periods = useMemo(() => {
    const today = new Date();
    return tenantFeeCycle(tenant) === "joining_date" ? candidatePeriods(today) : [periodKey(today)];
  }, [tenant]);
  const paymentsQ = useQuery({
    queryKey: qk.feeRegister(tenantId, periods.join(",")),
    queryFn: () => fetchPaymentsForPeriods(tenantId, periods),
  });
  const paidIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of paymentsQ.data ?? []) {
      if (p.student_id) set.add(p.student_id);
    }
    return set;
  }, [paymentsQ.data]);

  const students = studentsQ.data ?? NO_STUDENTS;
  const batches = batchesQ.data ?? NO_BATCHES;

  const batchNameById = useMemo(
    () => new Map<string, string>(batches.map((b) => [b.id, b.name])),
    [batches],
  );
  const joinYears = useMemo(() => joinYearsOf(students), [students]);
  const counts = useMemo(() => countByStatus(students), [students]);
  const filtered = useMemo(
    () =>
      filterStudents(students, filters, {
        onlyBatchIds: isAnyCoach && myBatchesOnly ? myBatchIds : null,
      }),
    [students, filters, isAnyCoach, myBatchesOnly, myBatchIds],
  );

  const exportList = useCallback(
    async (format: "csv" | "xlsx") => {
      try {
        await exportStudents(filtered, batchNameById, format);
        toast.success(`Exported ${filtered.length} players`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [filtered, batchNameById],
  );

  /** Opening a profile shows the row we already have at once; the full record loads behind it. */
  const primeProfile = useCallback((s: StudentRow) => qc.setQueryData(qk.student(s.id), s), [qc]);
  const refreshStudents = useCallback(
    () => qc.invalidateQueries({ queryKey: qk.students(tenantId) }),
    [qc, tenantId],
  );

  return {
    tenantId,
    filters,
    setFilter,
    clearPanelFilters,
    activeFilterCount: activeFilterCount(filters),

    isLoading: studentsQ.isLoading,
    // Only a failed FIRST load replaces the list with an error. If a refresh fails while
    // players are already on screen, they stay there.
    loadError: studentsQ.isLoadingError ? (studentsQ.error as Error) : null,
    retry: studentsQ.refetch,

    filtered,
    counts,
    batches,
    joinYears,
    paidIds,

    isAnyCoach,
    myBatchesOnly,
    setMyBatchesOnly,
    myBatchCount: myBatchIds.size,
    canDeleteArchived,

    exportList,
    primeProfile,
    refreshStudents,
  };
}
