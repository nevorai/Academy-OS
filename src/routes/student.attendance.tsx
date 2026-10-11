/**
 * Player's own Attendance tab. Same layout as the Metrol CRM Attendance tab:
 * today's card (In / Out / Practice), the month calendar, the counts, the day table,
 * and a Check in / Check out button pinned above the bottom bar.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut } from "lucide-react";
import { fetchMyPortalContext, fetchStudentHome, studentKeys } from "@/lib/student-app";
import { isPendingApproval } from "@/lib/admissions/lifecycle";
import { PlayerAttendanceCalendar } from "@/components/attendance/AttendanceCalendar";
import { ScanAttendanceDialog } from "@/components/attendance/ScanAttendanceDialog";
import { formatDuration } from "@/lib/attendance/constants";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/student/attendance")({
  head: () => ({
    meta: [{ title: "Attendance · Nevorai Academy" }, { name: "robots", content: "noindex" }],
  }),
  component: StudentAttendancePage,
});

const clock = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "—";

function StudentAttendancePage() {
  const qc = useQueryClient();
  const [scanOpen, setScanOpen] = useState(false);
  const ctxQ = useQuery({ queryKey: studentKeys.me, queryFn: fetchMyPortalContext });
  const ctx = ctxQ.data;
  const homeQ = useQuery({
    queryKey: ctx ? studentKeys.home(ctx.student_id) : ["student", "home", "none"],
    queryFn: () => fetchStudentHome(ctx!),
    enabled: !!ctx?.student_id,
    staleTime: 15_000,
  });

  if (ctxQ.isLoading || !ctx) {
    return (
      <div className="space-y-3 pb-32">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  const visit = homeQ.data?.todayVisit ?? null;
  const isIn = !!visit?.check_in_at && !visit.check_out_at;
  const pending = !ctx.student_id || (ctx.lifecycle_status ? isPendingApproval(ctx.lifecycle_status as never) : false);

  const onButton = () => {
    if (pending) {
      toast.info("Registration pending", {
        description: "Check-in unlocks once the academy approves your registration.",
      });
      return;
    }
    setScanOpen(true);
  };

  const today = (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]" aria-label="Today">
      <div className="text-[15px] font-bold">
        {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
      </div>
      <div className="text-xs text-muted-foreground">
        {isIn ? "You are in practice now" : visit ? "Practice done for now" : "Scan the academy QR to check in"}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Box label="In" value={clock(visit?.check_in_at)} />
        <Box label="Out" value={isIn ? "Still in" : clock(visit?.check_out_at)} />
      </div>
      <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Practice today</span>
        <span className="text-[15px] font-bold tabular-nums">
          {visit?.duration_minutes != null ? formatDuration(visit.duration_minutes) : "—"}
        </span>
      </div>
    </section>
  );

  return (
    <div className="pb-36">
      <PlayerAttendanceCalendar tenantId={ctx.tenant_id} studentId={ctx.student_id} top={today} />

      <div className="fixed inset-x-0 bottom-[calc(56px+max(env(safe-area-inset-bottom),0px))] z-30 px-4 pb-2 md:static md:mt-4 md:px-0 md:pb-0">
        <div className="mx-auto max-w-3xl">
          <Button
            type="button"
            onClick={onButton}
            className="h-14 w-full rounded-2xl text-base font-semibold shadow-[var(--shadow-elev)]"
          >
            {isIn ? <LogOut className="mr-2 size-5" /> : <LogIn className="mr-2 size-5" />}
            {isIn ? "Check out" : "Check in"}
          </Button>
        </div>
      </div>

      <ScanAttendanceDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        mode={isIn ? "out" : "in"}
        onRecorded={() => {
          void qc.invalidateQueries({ queryKey: studentKeys.home(ctx.student_id) });
          void qc.invalidateQueries({ queryKey: ["attendance", "cal-player", ctx.tenant_id, ctx.student_id] });
        }}
      />
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[17px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
