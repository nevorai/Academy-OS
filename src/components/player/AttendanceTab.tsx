import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ClipboardCheck } from "lucide-react";
import { Card } from "@/components/ds/Card";
import { PlayerAttendanceCalendar } from "@/components/attendance/AttendanceCalendar";
import { usePlayerAttendance, useRecentAttendance } from "@/hooks/use-player-profile";
import { todayISO } from "@/lib/attendance/calendar";
import { formatDuration } from "@/lib/attendance/constants";
import { parseDay } from "@/lib/students/profile-stats";
import { EmptyLine, KpiTile, SectionHeader, Skel } from "./parts";

/** Totals, the same month calendar the player sees, and the ten latest practice days. */
export function AttendanceTab({
  tenantId,
  studentId,
  batchId,
  joinedAt,
}: {
  tenantId: string;
  studentId: string;
  batchId: string | null;
  joinedAt: string | null;
}) {
  const q = usePlayerAttendance(tenantId, studentId);
  const recentQ = useRecentAttendance(tenantId, studentId, batchId, joinedAt);

  if (q.isLoading) return <Skel />;
  const pct = recentQ.data?.pct;
  const days = q.data?.days ?? [];
  const today = todayISO();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <KpiTile label="Last 30 days" value={pct != null ? `${pct}%` : "—"} />
        <KpiTile label="Days present" value={q.data?.presentDays ?? 0} />
        <KpiTile label="Time trained" value={formatDuration(q.data?.totalMinutes ?? 0)} />
      </div>

      <Card className="p-4">
        <PlayerAttendanceCalendar tenantId={tenantId} studentId={studentId} batchId={batchId} />
      </Card>

      <Card className="p-4">
        <SectionHeader icon={ClipboardCheck} title="Recent visits" />
        {days.length === 0 ? (
          <EmptyLine text="No attendance yet." />
        ) : (
          <ul className="divide-y divide-border">
            {days.slice(0, 10).map((d) => (
              <li key={d.session_date} className="py-2 flex items-center gap-2">
                <div className="text-xs font-medium w-24 shrink-0">
                  {format(parseDay(d.session_date), "MMM d, EEE")}
                </div>
                <div className="text-[11px] text-muted-foreground flex-1">
                  {d.first_check_in_at ? format(new Date(d.first_check_in_at), "h:mm a") : "—"}
                  {" → "}
                  {d.last_check_out_at
                    ? format(new Date(d.last_check_out_at), "h:mm a")
                    : d.session_date === today
                      ? "In academy"
                      : "No check-out"}
                  {d.visit_count > 1 ? (
                    <span className="ml-1">· {d.visit_count} visits</span>
                  ) : null}
                </div>
                <div className="text-xs tabular-nums font-medium">
                  {formatDuration(d.total_minutes)}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Link
            to="/dashboard/attendance"
            className="text-xs font-medium"
            style={{ color: "var(--brand)" }}
          >
            Open Attendance module →
          </Link>
        </div>
      </Card>
    </div>
  );
}
