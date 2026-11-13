import { createFileRoute, Link } from "@tanstack/react-router";
import { ListOrdered, Trophy, Target, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { InsightsTabsBar } from "@/components/match-center/InsightsTabsBar";
import { EmptyState } from "@/components/match-center/ui";
import { useDashboard } from "@/lib/dashboard-context";
import { useDemoData } from "@/lib/mc-demo/store";
import { deriveLeaderboards, type LeaderRow } from "@/lib/mc-demo/derive";

export const Route = createFileRoute("/match-center/leaderboards")({
  head: () => ({
    meta: [{ title: "Leaderboards · Match Center" }, { name: "robots", content: "noindex" }],
  }),
  component: LeaderboardsPage,
});

function LeaderboardsPage() {
  const { tenant } = useDashboard();
  const demo = useDemoData(tenant.id);

  // Real matches: career totals kept by the scoring engine (same rows the Records tab reads).
  const careersQ = useQuery({
    queryKey: ["mc-careers-all", tenant.id],
    enabled: !demo,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mc_player_careers")
        .select("*, mc_athlete_profiles(id, student_id, students(name))")
        .eq("tenant_id", tenant.id);
      if (error) throw error;
      return (data ?? []) as unknown as Array<Record<string, unknown>>;
    },
  });

  const leaders = demo ? deriveLeaderboards(demo) : fromCareers(careersQ.data ?? []);
  const loading = !demo && careersQ.isLoading;
  const hasData =
    leaders.mostRuns.length > 0 ||
    leaders.mostWickets.length > 0 ||
    leaders.mostBoundaries.length > 0;

  return (
    <div>
      <InsightsTabsBar />
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      ) : !hasData ? (
        <EmptyState
          icon={ListOrdered}
          title="No leaderboards yet"
          description="Finish a match with academy players in it and the top run scorers and wicket takers appear here."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <LeaderCard icon={Trophy} title="Most Runs" unit="runs" rows={leaders.mostRuns} />
          <LeaderCard icon={Target} title="Most Wickets" unit="wkts" rows={leaders.mostWickets} />
          <LeaderCard
            icon={Zap}
            title="Most Boundaries"
            unit="4s+6s"
            rows={leaders.mostBoundaries}
          />
        </div>
      )}
    </div>
  );
}

function fromCareers(careers: Array<Record<string, unknown>>) {
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const name = (c: Record<string, unknown>) => {
    const ap = c.mc_athlete_profiles as { students?: { name?: string } | null } | null | undefined;
    return ap?.students?.name ?? "Unknown player";
  };
  const top = (value: (c: Record<string, unknown>) => number): LeaderRow[] =>
    careers
      .map((c) => ({
        athleteId: (c.athlete_profile_id as string | null) ?? null,
        name: name(c),
        value: value(c),
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  return {
    mostRuns: top((c) => num(c.runs)),
    mostWickets: top((c) => num(c.wickets)),
    mostBoundaries: top((c) => num(c.fours) + num(c.sixes)),
  };
}

function LeaderCard({
  icon: Icon,
  title,
  unit,
  rows,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  unit: string;
  rows: LeaderRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <Icon className="size-3.5" /> {title}
      </div>
      <ol className="space-y-1">
        {rows.map((r, i) => (
          <li
            key={(r.athleteId ?? r.name) + i}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/40"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold tabular-nums">
                {i + 1}
              </span>
              {r.athleteId ? (
                <Link
                  to="/match-center/players/$athleteId"
                  params={{ athleteId: r.athleteId }}
                  className="truncate font-medium hover:text-primary"
                >
                  {r.name}
                </Link>
              ) : (
                <span className="truncate font-medium">{r.name}</span>
              )}
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums">
              {r.value}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
