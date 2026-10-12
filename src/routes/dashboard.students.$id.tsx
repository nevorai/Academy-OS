import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SectionTabs, type SectionTab } from "@/components/shared/SectionTabs";
import { AttendanceTab } from "@/components/player/AttendanceTab";
import { EditPlayerSheet } from "@/components/player/EditPlayerSheet";
import { MatchesTab } from "@/components/player/MatchesTab";
import { MoreTab } from "@/components/player/MoreTab";
import { OverviewTab } from "@/components/player/OverviewTab";
import { PerformanceTab } from "@/components/player/PerformanceTab";
import { PlayerHeader } from "@/components/player/PlayerHeader";
import { PlayerPageSkeleton } from "@/components/player/PlayerPageSkeleton";
import { PlayerQuickStats } from "@/components/player/PlayerQuickStats";
import { TimelineTab } from "@/components/player/TimelineTab";
import { usePlayerProfile } from "@/hooks/use-player-profile";
import { useDashboard } from "@/lib/dashboard-context";
import { parsePlayerTab, type PlayerTab } from "@/lib/students/profile-tabs";

export const Route = createFileRoute("/dashboard/students/$id")({
  head: () => ({
    meta: [{ title: "Player · Academy" }, { name: "robots", content: "noindex" }],
  }),
  // `?tab=attendance` opens that section, so a refresh or a shared link lands on the same tab.
  validateSearch: (search: Record<string, unknown>): { tab?: PlayerTab } => ({
    tab: parsePlayerTab(search.tab),
  }),
  component: PlayerProfileRoute,
});

function PlayerProfileRoute() {
  const { id } = Route.useParams();
  const { tab: tabParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { tenant } = useDashboard();
  const [editing, setEditing] = useState(false);
  const { student, athlete, athleteId, liveState, loading } = usePlayerProfile(tenant.id, id);

  const tab = tabParam ?? "overview";
  const setTab = (next: PlayerTab) =>
    navigate({ search: (prev) => ({ ...prev, tab: next }), replace: true, resetScroll: false });

  if (loading) return <PlayerPageSkeleton />;
  if (!student) {
    return (
      <div className="max-w-md mx-auto pt-16 text-center">
        <p className="text-sm text-muted-foreground">Player not found.</p>
        <Link
          to="/dashboard/students"
          className="text-sm mt-3 inline-block"
          style={{ color: "var(--brand)" }}
        >
          Back to Players
        </Link>
      </div>
    );
  }

  const tabs: SectionTab<PlayerTab>[] = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <OverviewTab tenantId={tenant.id} studentId={id} athleteId={athleteId} dob={student.dob} />
      ),
    },
    {
      id: "timeline",
      label: "Timeline",
      content: <TimelineTab tenantId={tenant.id} studentId={id} athleteId={athleteId} />,
    },
    { id: "performance", label: "Performance", content: <PerformanceTab athleteId={athleteId} /> },
    {
      id: "attendance",
      label: "Attendance",
      content: (
        <AttendanceTab
          tenantId={tenant.id}
          studentId={id}
          batchId={student.batch_id ?? null}
          joinedAt={student.joined_at}
        />
      ),
    },
    { id: "matches", label: "Matches", content: <MatchesTab athleteId={athleteId} /> },
    { id: "more", label: "More", content: <MoreTab student={student} tenantId={tenant.id} /> },
  ];

  return (
    <div className="space-y-4 pb-8 max-w-3xl mx-auto">
      <PlayerHeader
        student={student}
        athlete={athlete}
        liveState={liveState}
        onEdit={() => setEditing(true)}
        onTab={setTab}
      />
      <PlayerQuickStats
        tenantId={tenant.id}
        studentId={id}
        athleteId={athleteId}
        batchId={student.batch_id ?? null}
        joinedAt={student.joined_at}
      />
      <SectionTabs tabs={tabs} active={tab} onChange={setTab} label="Player sections" />
      <EditPlayerSheet studentId={id} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
