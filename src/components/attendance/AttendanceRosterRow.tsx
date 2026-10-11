import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";
import { ListItem } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/site/PersonAvatar";
import { supabase } from "@/integrations/supabase/client";
import { useCheckIn, useCheckOut } from "@/lib/attendance/queries";
import { attendanceStateTone, type AttendanceState } from "@/lib/attendance/constants";
import type { StudentLite, TodayRow } from "@/lib/attendance/roster";
import { cn } from "@/lib/utils";

/**
 * Fetch the just-created mark id for a student via the shared attendance_today
 * view and hand it to the undo helper. Runs slightly after the invalidate so
 * we get the fresh row without adding a new query key.
 */
function deferredUndoCheckIn(studentId: string, undo: (markId: string) => void) {
  setTimeout(async () => {
    const { data } = await supabase
      .from("attendance_today")
      .select("mark_id, student_id, current_state")
      .eq("student_id", studentId)
      .eq("current_state", "in_academy")
      .limit(1)
      .maybeSingle();
    if (data?.mark_id) undo(data.mark_id);
  }, 250);
}

export function HistoryStatusChip({ state }: { state: AttendanceState }) {
  const tone = attendanceStateTone[state];
  const toneClass =
    tone === "success"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
      : tone === "info"
        ? "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"
        : tone === "danger"
          ? "bg-destructive/10 text-destructive border-destructive/20"
          : "bg-muted text-muted-foreground border-border/60";
  const label =
    state === "in_academy"
      ? "Present"
      : state === "checked_out"
        ? "Checked Out"
        : state === "absent"
          ? "Absent"
          : "Waiting";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClass,
      )}
    >
      {label}
    </span>
  );
}

export function AttendanceRosterRow({
  student,
  row,
  canMark,
  readOnly,
  tenantId,
  lateAfterMs,
  selectMode,
  isSelected,
  onToggleSelected,
  onCheckedIn,
  onUndoCheckIn,
  onUndoCheckOut,
}: {
  student: StudentLite;
  row: TodayRow | undefined;
  canMark: boolean;
  readOnly?: boolean;
  tenantId: string;
  lateAfterMs: number | null;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelected: (id: string) => void;
  onCheckedIn: (studentId: string) => void;
  onUndoCheckIn: (markId: string) => void;
  onUndoCheckOut: (markId: string) => void;
}) {
  const state: AttendanceState = row?.current_state ?? "not_marked";
  const checkIn = useCheckIn();
  const checkOut = useCheckOut(tenantId);
  const busy = checkIn.isPending || checkOut.isPending;

  // Late = checked in after the batch's grace threshold. Derived, not stored.
  const isLate = !!(
    row?.check_in_at &&
    lateAfterMs != null &&
    new Date(row.check_in_at).getTime() > lateAfterMs
  );

  const onCheckIn = () => {
    if (!student.batch_id) {
      toast.error("Assign this student to a batch first");
      return;
    }
    checkIn.mutate(
      { tenantId, batchId: student.batch_id, studentId: student.id },
      {
        onSuccess: () => {
          toast.success(`${student.name} checked in`, {
            duration: 5000,
            action: {
              label: "Undo",
              onClick: () => deferredUndoCheckIn(student.id, onUndoCheckIn),
            },
          });
          onCheckedIn(student.id);
        },
        onError: (e: Error) => toast.error(e.message || "Check-in failed"),
      },
    );
  };
  const onCheckOut = () => {
    if (!row) return;
    const markId = row.mark_id;
    checkOut.mutate(
      { markId },
      {
        onSuccess: () =>
          toast.success(`${student.name} checked out`, {
            duration: 5000,
            action: { label: "Undo", onClick: () => onUndoCheckOut(markId) },
          }),
        onError: (e: Error) => toast.error(e.message || "Check-out failed"),
      },
    );
  };

  const checkInAt = row?.check_in_at;
  const checkOutAt = row?.check_out_at;

  return (
    <div
      data-student-id={student.id}
      data-waiting={state === "not_marked" ? "1" : "0"}
      className={cn("rounded-md transition-shadow", selectMode && isSelected ? "bg-primary/5" : "")}
    >
      <ListItem
        className="px-2.5 py-2"
        leading={
          <div className="flex items-center gap-1.5">
            {selectMode && canMark ? (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelected(student.id)}
                aria-label={`Select ${student.name}`}
                className="size-3.5 rounded border-border"
              />
            ) : null}
            <PersonAvatar name={student.name} src={student.photo_url} className="size-9" />
          </div>
        }
        title={
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-sm font-semibold">{student.name}</span>
              {isLate ? (
                <span
                  className="inline-flex shrink-0 items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                  aria-label="Arrived late"
                >
                  Late
                </span>
              ) : null}
              {row?.auto_checked_out ? (
                <span
                  className="inline-flex shrink-0 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                  title="Checked out automatically"
                >
                  Auto
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium">
              {checkInAt && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <LogIn className="size-3" /> {format(new Date(checkInAt), "h:mm a")}
                </span>
              )}
              {checkOutAt && (
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <LogOut className="size-3" /> {format(new Date(checkOutAt), "h:mm a")}
                </span>
              )}
            </div>
          </div>
        }
        subtitle={null}
        trailing={
          readOnly ? (
            <HistoryStatusChip state={state} />
          ) : canMark ? (
            <div className="flex items-center gap-1">
              {state === "in_academy" ? (
                <Button
                  size="sm"
                  onClick={onCheckOut}
                  disabled={busy}
                  className="h-9 rounded-full bg-blue-600 px-3 text-[11px] font-bold text-white shadow-sm hover:bg-blue-700"
                >
                  Check Out
                </Button>
              ) : state === "checked_out" ? (
                <div className="flex items-center gap-1 rounded-full bg-muted/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <CheckCircle2 className="size-3 text-emerald-500" /> Done
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={onCheckIn}
                  disabled={busy}
                  className="h-9 rounded-full bg-emerald-600 px-3 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700"
                >
                  Check In
                </Button>
              )}
            </div>
          ) : null
        }
      />
    </div>
  );
}
