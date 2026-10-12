import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Activity, Cake, ClipboardCheck, StickyNote, Swords } from "lucide-react";
import { Card } from "@/components/ds/Card";
import { AdmissionTimelineList } from "@/components/dashboard/AdmissionChecklist";
import { admissionTimelineQuery } from "@/lib/admissions";
import { formatDuration } from "@/lib/attendance/constants";
import { nextBirthday } from "@/lib/students/profile-stats";
import {
  usePlayerAttendance,
  usePlayerMatches,
  usePlayerRemarks,
} from "@/hooks/use-player-profile";
import { CoachNotes } from "./CoachNotes";
import { ChipPill, EmptyLine, SectionHeader, Skel } from "./parts";

function AdmissionTimelineCard({ tenantId, studentId }: { tenantId: string; studentId: string }) {
  const { data = [] } = useQuery(admissionTimelineQuery({ tenantId, studentId }));
  if (!data.length) return null;
  return (
    <Card className="p-4 sm:col-span-2">
      <SectionHeader icon={ClipboardCheck} title="Admission Timeline" />
      <div className="mt-2">
        <AdmissionTimelineList events={data} />
      </div>
    </Card>
  );
}

/** The last six matches as small chips: MoM, captain, keeper or a plain dot. */
function FormStrip({ athleteId }: { athleteId: string | null }) {
  const q = usePlayerMatches(athleteId);
  if (!athleteId) return <EmptyLine text="Not linked to Match Center yet." />;
  if (q.isLoading) return <Skel />;
  const rows = (q.data ?? []).slice(0, 6);
  if (rows.length === 0) return <EmptyLine text="No recent matches." />;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {rows.map((r) => {
        const tone = r.is_player_of_match
          ? "bg-amber-500 text-white"
          : r.is_captain
            ? "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300"
            : "bg-muted text-muted-foreground";
        const label = r.is_player_of_match ? "MoM" : r.is_captain ? "C" : r.is_keeper ? "K" : "•";
        return (
          <div
            key={r.id}
            className={`h-8 min-w-[28px] px-1.5 grid place-items-center rounded-md text-[10.5px] font-semibold ${tone}`}
            title={r.match?.scheduled_date ?? ""}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

export function OverviewTab({
  tenantId,
  studentId,
  athleteId,
  dob,
}: {
  tenantId: string;
  studentId: string;
  athleteId: string | null;
  dob: string | null;
}) {
  const summaryQ = usePlayerAttendance(tenantId, studentId);
  const remarksQ = usePlayerRemarks(studentId);
  const matchesQ = usePlayerMatches(athleteId);

  const birthday = nextBirthday(dob);
  const lastVisit = summaryQ.data?.lastVisit;
  const lastMatch = matchesQ.data?.[0];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card className="p-4">
        <SectionHeader icon={ClipboardCheck} title="Attendance" />
        {summaryQ.isLoading ? (
          <Skel />
        ) : (
          <div className="text-sm">
            <div className="text-2xl font-semibold">{summaryQ.data?.presentDays ?? 0}</div>
            <div className="text-xs text-muted-foreground">
              Present days · {formatDuration(summaryQ.data?.totalMinutes ?? 0)} trained
            </div>
            {lastVisit?.check_in_at ? (
              <div className="text-[11px] text-muted-foreground mt-2">
                Last seen{" "}
                {formatDistanceToNow(new Date(lastVisit.check_in_at), { addSuffix: true })}
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader icon={Swords} title="Latest Match" />
        {matchesQ.isLoading ? (
          <Skel />
        ) : lastMatch?.match ? (
          <div className="text-sm">
            <div className="font-medium truncate">{lastMatch.match.ground_name ?? "Match"}</div>
            <div className="text-[11px] text-muted-foreground">
              {lastMatch.match.scheduled_date
                ? format(new Date(lastMatch.match.scheduled_date), "MMM d, yyyy")
                : ""}
              {lastMatch.match.match_format ? ` · ${lastMatch.match.match_format}` : ""}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {lastMatch.is_captain ? <ChipPill>Captain</ChipPill> : null}
              {lastMatch.is_keeper ? <ChipPill>Keeper</ChipPill> : null}
              {lastMatch.is_player_of_match ? (
                <ChipPill tone="gold">Player of Match</ChipPill>
              ) : null}
              {lastMatch.match.result ? (
                <ChipPill tone="muted">{lastMatch.match.result}</ChipPill>
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyLine text="No matches yet." />
        )}
      </Card>

      <Card className="p-4 sm:col-span-2">
        <div className="flex items-center justify-between">
          <SectionHeader icon={StickyNote} title="Coach Notes" />
          <span className="text-[11px] text-muted-foreground">{remarksQ.data?.length ?? 0}</span>
        </div>
        <CoachNotes tenantId={tenantId} studentId={studentId} />
      </Card>

      <AdmissionTimelineCard tenantId={tenantId} studentId={studentId} />

      <Card className="p-4">
        <SectionHeader icon={Activity} title="Current Form" />
        <FormStrip athleteId={athleteId} />
      </Card>

      <Card className="p-4">
        <SectionHeader icon={Cake} title="Next Birthday" />
        {birthday ? (
          <div className="text-sm">
            <div className="font-medium">{format(birthday.date, "MMM d")}</div>
            <div className="text-[11px] text-muted-foreground">
              {birthday.days === 0
                ? "Today 🎉"
                : birthday.days === 1
                  ? "Tomorrow"
                  : `${birthday.days} days away`}
            </div>
          </div>
        ) : (
          <EmptyLine text="No DOB on file." />
        )}
      </Card>
    </div>
  );
}
