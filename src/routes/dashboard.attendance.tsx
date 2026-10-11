/**
 * Nevorai Academy: owner/coach Attendance screen.
 *
 * Layout only. The data, the derived numbers and the check-in/out actions
 * live in `useAttendanceDay`; the rows, summary tiles and toolbar are in
 * `components/attendance`. Nothing here writes to the database directly.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { format, startOfDay } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Card, EmptyState, ErrorState, SearchBar, Skeleton } from "@/components/ds";
import { VirtualList } from "@/components/ds/VirtualList";
import { FilterTabs } from "@/components/shared/FilterTabs";
import { Button } from "@/components/ui/button";
import { AttendanceRosterRow } from "@/components/attendance/AttendanceRosterRow";
import { AttendanceSummary } from "@/components/attendance/AttendanceSummary";
import { AttendanceToolbar } from "@/components/attendance/AttendanceToolbar";
import { useAttendanceDay } from "@/hooks/use-attendance-day";
import type { RosterTab, StudentLite } from "@/lib/attendance/roster";

export const Route = createFileRoute("/dashboard/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance · Nevorai Academy" },
      {
        name: "description",
        content:
          "Check students in and out. Live academy roster and append-only attendance history.",
      },
    ],
  }),
  component: AttendancePage,
});

function AttendancePage() {
  const a = useAttendanceDay();
  const navigate = useNavigate();

  useEffect(() => {
    if (!a.permLoading && !a.canMark) navigate({ to: "/dashboard", replace: true });
  }, [a.canMark, a.permLoading, navigate]);

  const { groups, kpis, rosterTab } = a;
  const activeStudents =
    rosterTab === "waiting"
      ? groups.waiting
      : rosterTab === "present"
        ? groups.present
        : groups.done;
  const activeEmpty =
    rosterTab === "waiting"
      ? "No students are waiting for check-in."
      : rosterTab === "present"
        ? "No students are currently present."
        : "No students have checked out yet.";
  const goToday = () => a.setSelectedDate(startOfDay(new Date()));

  return (
    <div className="-mt-4 md:-mt-8">
      <AttendanceToolbar
        selectedDate={a.selectedDate}
        onDateChange={a.setSelectedDate}
        selectedISO={a.selectedISO}
        canMark={a.canMark}
        quickMode={a.quickMode}
        onToggleQuick={a.toggleQuick}
        selectMode={a.selectMode}
        onToggleSelect={a.toggleSelectMode}
        onRecorded={a.refreshToday}
      />

      {a.historyMode ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <span>
            Viewing attendance for{" "}
            <span className="font-medium text-foreground">
              {format(a.selectedDate, "d MMMM yyyy")}
            </span>
          </span>
          <button
            type="button"
            onClick={goToday}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 font-medium hover:bg-muted"
          >
            <ArrowLeft className="size-3" /> Today
          </button>
        </div>
      ) : null}

      {/* Sticky search: always reachable while scrolling. */}
      <div className="sticky top-14 z-20 -mx-4 mb-2 border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur md:-mx-8 md:px-8">
        <SearchBar
          value={a.query}
          onChange={a.setQuery}
          placeholder="Search name, player ID or mobile"
        />
      </div>

      {a.hardFailure ? (
        <ErrorState
          title="Couldn't load attendance"
          description={`Failed to load ${a.failedQueries.map((f) => f.label).join(", ")}. Please try again.`}
          onRetry={a.retryAll}
        />
      ) : a.partialFailure ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
        >
          <span>
            Some data couldn't refresh ({a.failedQueries.map((f) => f.label).join(", ")}). Showing
            last known values.
          </span>
          <button
            type="button"
            className="rounded border border-amber-500/50 px-2 py-0.5 font-medium hover:bg-amber-500/20"
            onClick={() => a.failedQueries.forEach((f) => f.refetch())}
          >
            Retry
          </button>
        </div>
      ) : null}

      {a.isLoading ? (
        <div>
          <Skeleton className="h-12" />
          <div className="mt-2 space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        </div>
      ) : a.activeBatches.length === 0 ? (
        <EmptyState
          title="No active batches"
          description="Create a batch to start taking attendance."
          action={
            <Button asChild size="sm" className="rounded-full">
              <Link to="/dashboard/batches">Create a batch</Link>
            </Button>
          }
        />
      ) : (
        <>
          <AttendanceSummary kpis={kpis} />

          {/* Roster tab selector: Waiting / Present / Checked Out. */}
          <div className="sticky top-[6.5rem] z-10 -mx-4 mt-3 border-b border-border/60 bg-background/95 px-4 py-1.5 backdrop-blur md:-mx-8 md:px-8">
            <FilterTabs
              value={rosterTab}
              onChange={(k: string) => a.changeRosterTab(k as RosterTab)}
              items={[
                { key: "waiting", label: "Waiting", count: groups.waiting.length },
                { key: "present", label: "Present", count: groups.present.length },
                { key: "done", label: "Checked Out", count: groups.done.length },
              ]}
              ariaLabel="Attendance groups"
            />
          </div>

          {/* Bulk action bar: writes are disabled when looking at a past day. */}
          {a.isTodayView && a.selectMode ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-2">
              <span className="text-xs text-muted-foreground">{a.selected.size} selected</span>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={a.bulkCheckIn} className="min-h-9">
                  Check In Selected
                </Button>
                <Button size="sm" variant="secondary" onClick={a.bulkCheckOut} className="min-h-9">
                  Check Out Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={a.markAllWaitingPresent}
                  className="min-h-9"
                >
                  Mark all present
                </Button>
              </div>
            </div>
          ) : null}

          {a.historyMode && (a.attendanceRows?.length ?? 0) === 0 && !a.attendanceLoading ? (
            <EmptyState
              title="No attendance recorded"
              description={`Nothing was marked on ${format(a.selectedDate, "d MMMM yyyy")}.`}
              action={
                <Button variant="default" size="sm" onClick={goToday}>
                  Back to Today
                </Button>
              }
            />
          ) : a.rosterStudents.length === 0 ? (
            <EmptyState
              title={a.query ? "No matches" : "No students in this session"}
              description={
                a.query
                  ? "Try a different name, player ID or number."
                  : "Change the session filter or add students to a batch."
              }
            />
          ) : activeStudents.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">{activeEmpty}</p>
          ) : (
            <div key={rosterTab} className="mt-2 animate-in fade-in duration-150" ref={a.rosterRef}>
              <Card className="p-1">
                <VirtualList
                  items={activeStudents}
                  estimateSize={76}
                  overscan={8}
                  className="max-h-[calc(100vh-360px)] min-h-[400px]"
                  getKey={(s: StudentLite) => s.id}
                  renderItem={(s: StudentLite) => (
                    <div className="border-b border-border/60 last:border-b-0">
                      <AttendanceRosterRow
                        student={s}
                        row={a.stateByStudent.get(s.id)}
                        canMark={a.canMark}
                        readOnly={a.historyMode}
                        tenantId={a.tenantId}
                        lateAfterMs={
                          s.batch_id ? (a.batchLateThresholdById.get(s.batch_id) ?? null) : null
                        }
                        selectMode={a.selectMode && a.isTodayView}
                        isSelected={a.selected.has(s.id)}
                        onToggleSelected={a.toggleSelected}
                        onCheckedIn={a.focusNextWaiting}
                        onUndoCheckIn={a.undoCheckIn}
                        onUndoCheckOut={a.undoCheckOut}
                      />
                    </div>
                  )}
                />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
