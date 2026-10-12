import { tenure } from "@/lib/students/profile-stats";
import { usePlayerCareer, useRecentAttendance } from "@/hooks/use-player-profile";
import { KpiTile } from "./parts";

const one = (n: number | null | undefined) => (n != null ? Number(n).toFixed(1) : "—");

/** The eight numbers under the player card. */
export function PlayerQuickStats({
  tenantId,
  studentId,
  athleteId,
  batchId,
  joinedAt,
}: {
  tenantId: string;
  studentId: string;
  athleteId: string | null;
  batchId: string | null;
  joinedAt: string | null;
}) {
  const recentQ = useRecentAttendance(tenantId, studentId, batchId, joinedAt);
  const career = usePlayerCareer(athleteId).data ?? null;
  const pct = recentQ.data?.pct;

  return (
    <div className="grid grid-cols-4 gap-2">
      <KpiTile label="Attendance" value={pct != null ? `${pct}%` : "—"} hint="30 days" />
      <KpiTile label="Matches" value={career?.matches ?? 0} />
      <KpiTile label="Runs" value={career?.runs ?? 0} />
      <KpiTile label="Wickets" value={career?.wickets ?? 0} />
      <KpiTile label="Strike Rate" value={one(career?.strike_rate)} />
      <KpiTile label="Bat Avg" value={one(career?.average)} />
      <KpiTile label="Bowl Avg" value={one(career?.bowling_average)} />
      <KpiTile label="With us" value={tenure(joinedAt)} />
    </div>
  );
}
