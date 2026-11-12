import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Radio,
  CalendarClock,
  Star,
  Award,
  Trophy,
  PlusCircle,
  Users2,
  Radio as RadioIcon,
  Search,
  Activity,
  Zap,
  Sparkles,
  MapPin,
  CloudSun,
  ChevronRight,
  UserPlus,
  Medal,
  ClipboardList,
  Rocket,
  BookOpen,
} from "lucide-react";
import { PageHeader } from "@/components/match-center/MatchCenterLayout";
import {
  QuickActionCard,
  DashboardCard,
  EmptyState,
  SectionTitle,
  StatCard,
  StatusChip,
} from "@/components/match-center/ui";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/lib/dashboard-context";
import { listMatches, type MatchWithTeams } from "@/lib/mc-matches";
import { listTeams } from "@/lib/mc-teams";
import { listAthletes } from "@/lib/mc-athletes";
import { listTournaments } from "@/lib/mc-tournaments";
import { listRecognitions, listAcademyTimeline } from "@/lib/mc-recognition-engine";
import { useDemoOverlay } from "@/lib/mc-demo/overlay";

export const Route = createFileRoute("/match-center/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard · Match Center" }, { name: "robots", content: "noindex" }],
  }),
  component: MatchCenterDashboard,
});

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function MatchCenterDashboard() {
  const { tenant, profile } = useDashboard();
  const tenantId = tenant.id;

  // Shared cache keys with list routes so dashboard warms Teams/Players/etc.
  const matchesQ = useQuery({
    queryKey: ["mc-matches", tenantId],
    queryFn: () => listMatches(tenantId),
  });
  const teamsQ = useQuery({
    queryKey: ["mc-teams", tenantId],
    queryFn: () => listTeams(tenantId),
  });
  const athletesQ = useQuery({
    queryKey: ["mc-athletes", tenantId],
    queryFn: () => listAthletes(tenantId),
  });
  const tournamentsQ = useQuery({
    queryKey: ["mc-tournaments", tenantId],
    queryFn: () => listTournaments(tenantId),
  });
  const recognitionsQ = useQuery({
    queryKey: ["mc-recognitions", tenantId],
    queryFn: () => listRecognitions(tenantId),
  });
  const timelineQ = useQuery({
    queryKey: ["mc-academy-timeline", tenantId, 8],
    queryFn: () => listAcademyTimeline(tenantId, 8),
  });

  const matches = useDemoOverlay(tenantId, matchesQ.data, (d) => d.matches);
  const teams = useDemoOverlay(tenantId, teamsQ.data, (d) => d.teams);
  const athletes = useDemoOverlay(tenantId, athletesQ.data, (d) => d.players);
  const tournaments = useDemoOverlay(tenantId, tournamentsQ.data, (d) => d.tournaments);
  const recognitions = recognitionsQ.data ?? [];
  const timeline = timelineQ.data ?? [];

  const now = new Date();
  const liveMatches = useMemo(() => matches.filter((m) => m.status === "live"), [matches]);
  const upcomingMatches = useMemo(
    () =>
      matches
        .filter((m) => m.status === "scheduled" && m.scheduled_date)
        .filter((m) => new Date(m.scheduled_date as string) >= new Date(now.toDateString()))
        .sort((a, b) => (a.scheduled_date! < b.scheduled_date! ? -1 : 1))
        .slice(0, 5),
    [matches],
  );
  const todaysMatches = useMemo(
    () => matches.filter((m) => m.scheduled_date && isSameDay(new Date(m.scheduled_date), now)),
    [matches],
  );
  const recentMatches = useMemo(
    () => matches.filter((m) => m.status === "completed").slice(0, 5),
    [matches],
  );
  const recentRecognitions = useMemo(
    () =>
      recognitions.filter((r) => r.status === "published" || r.status === "approved").slice(0, 5),
    [recognitions],
  );
  const activeTournament = tournaments.find((t) => t.status === "in_progress") ?? tournaments[0];

  const hasAnyData =
    matches.length > 0 ||
    teams.length > 0 ||
    athletes.length > 0 ||
    tournaments.length > 0 ||
    recognitions.length > 0;

  const loading =
    matchesQ.isLoading || teamsQ.isLoading || athletesQ.isLoading || tournamentsQ.isLoading;

  const displayName =
    (profile as { name?: string } | null)?.name ??
    (tenant as { contact_name?: string | null }).contact_name ??
    "Coach";

  const [more, setMore] = useState(false);

  return (
    <div className="space-y-4 pb-6">
      {/* ONE CARD: the live match, or a big Start button. */}
      {liveMatches.length > 0 ? (
        <LiveHero match={liveMatches[0]} extra={liveMatches.length - 1} />
      ) : (
        <WelcomeHero
          name={displayName}
          upcomingCount={upcomingMatches.length}
          todaysCount={todaysMatches.length}
          nextMatch={upcomingMatches[0]}
        />
      )}

      {!loading && !hasAnyData ? (
        <OnboardingChecklist />
      ) : (
        <>
          {/* SIX BIG BUTTONS, plain words */}
          <div className="grid grid-cols-3 gap-2.5 md:grid-cols-6">
            <ActionTile
              icon={Radio}
              label="Live scoring"
              hint="Score a match"
              to="/match-center/live"
              live={liveMatches.length > 0}
            />
            <ActionTile
              icon={ClipboardList}
              label="Results"
              hint="Scorecards"
              to="/match-center/matches"
            />
            <ActionTile icon={Users2} label="Teams" hint="Squads" to="/match-center/teams" />
            <ActionTile
              icon={UserPlus}
              label="Players"
              hint="Who plays"
              to="/match-center/players"
            />
            <ActionTile
              icon={Trophy}
              label="Tournaments"
              hint="Leagues"
              to="/match-center/tournaments"
            />
            <ActionTile
              icon={Activity}
              label="Stats"
              hint="Runs and wickets"
              to="/match-center/performance"
            />
          </div>

          {/* One slim line of numbers */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-1 text-[12.5px] text-muted-foreground">
            <span>
              <b className="font-semibold tabular-nums text-foreground">{liveMatches.length}</b>{" "}
              live
            </span>
            <span>
              <b className="font-semibold tabular-nums text-foreground">{todaysMatches.length}</b>{" "}
              today
            </span>
            <span>
              <b className="font-semibold tabular-nums text-foreground">{teams.length}</b> teams
            </span>
            <span>
              <b className="font-semibold tabular-nums text-foreground">{athletes.length}</b>{" "}
              players
            </span>
          </div>

          <DashboardCard
            title="Matches"
            icon={CalendarClock}
            tone="analytics"
            action={
              <Link
                to="/match-center/matches"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                See all <ChevronRight className="size-3" />
              </Link>
            }
          >
            <FixturesTabs live={liveMatches} upcoming={upcomingMatches} recent={recentMatches} />
          </DashboardCard>

          {/* Everything else folds away */}
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-[14px] font-semibold"
          >
            More: recent activity, awards, tournament
            <ChevronRight className={"size-4 transition-transform " + (more ? "rotate-90" : "")} />
          </button>

          {more && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <DashboardCard title="Recent activity" icon={Activity} tone="ai">
                {timeline.length === 0 ? (
                  <EmptyState
                    icon={Activity}
                    title="Nothing yet"
                    description="Match events will show here as they happen."
                  />
                ) : (
                  <ol className="space-y-3">
                    {timeline.slice(0, 6).map((t) => (
                      <li key={t.id}>
                        <div className="truncate text-sm font-medium leading-tight">{t.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(t.created_at as string).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </DashboardCard>

              <DashboardCard title="Awards" icon={Award} tone="award">
                {recentRecognitions.length === 0 ? (
                  <EmptyState
                    icon={Award}
                    title="No awards yet"
                    description="Player awards will show here."
                    actionLabel="Open awards"
                    actionTo="/match-center/recognition"
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {recentRecognitions.map((r) => (
                      <li key={r.id} className="flex items-center gap-2.5">
                        <Medal className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{r.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {r.athleteName ?? "Recognition"}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </DashboardCard>

              <DashboardCard title="Tournament" icon={Trophy} tone="tournament">
                {!activeTournament ? (
                  <EmptyState
                    icon={Trophy}
                    title="No tournaments"
                    description="Create one to track standings."
                    actionLabel="Create tournament"
                    actionTo="/match-center/tournaments"
                  />
                ) : (
                  <Link
                    to="/match-center/tournaments/$tournamentId"
                    params={{ tournamentId: activeTournament.id }}
                    className="block rounded-xl border border-border p-3 hover:border-foreground/20"
                  >
                    <div className="truncate text-base font-semibold tracking-tight">
                      {activeTournament.name}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {activeTournament.status?.replace("_", " ") ?? "tournament"} · tap to open
                    </div>
                  </Link>
                )}
              </DashboardCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActionTile({
  icon: Icon,
  label,
  hint,
  to,
  live,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  to: string;
  live?: boolean;
}) {
  return (
    <Link
      to={to}
      className="relative flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card px-1.5 py-3 text-center transition-colors hover:border-foreground/30 active:scale-[0.97]"
    >
      {live && (
        <span className="absolute right-2.5 top-2.5 size-2 animate-pulse rounded-full bg-rose-500" />
      )}
      <span
        className="grid size-10 place-items-center rounded-xl"
        style={{
          backgroundColor:
            "color-mix(in oklab, var(--tenant-brand, var(--brand, #2A7A4B)) 12%, transparent)",
          color: "var(--tenant-brand, var(--brand, #2A7A4B))",
        }}
      >
        <Icon className="size-5" />
      </span>
      <span className="text-[13px] font-semibold leading-tight">{label}</span>
      <span className="hidden text-[11px] leading-tight text-muted-foreground sm:block">
        {hint}
      </span>
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function LiveHero({ match, extra }: { match: MatchWithTeams; extra: number }) {
  const teamA = match.team_a?.name ?? "Team A";
  const teamB = match.team_b?.name ?? "Team B";
  return (
    <div className="overflow-hidden rounded-2xl border border-rose-500/30 bg-card">
      <div className="flex items-center justify-between bg-rose-500/10 px-4 py-1.5">
        <StatusChip tone="live" pulse>
          LIVE NOW
        </StatusChip>
        {extra > 0 ? (
          <span className="text-[11px] font-medium text-muted-foreground">+{extra} more live</span>
        ) : null}
      </div>
      <div className="px-4 pb-3 pt-2.5">
        <div className="text-[19px] font-bold leading-tight tracking-tight md:text-2xl">
          {teamA} <span className="font-medium text-muted-foreground">vs</span> {teamB}
        </div>
        {match.ground_name ? (
          <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-muted-foreground">
            <MapPin className="size-3.5" /> {match.ground_name}
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <Button asChild className="h-12 rounded-xl text-[15px] font-semibold">
            <Link to="/scorer/$matchId" params={{ matchId: match.id }}>
              <Radio className="mr-1.5 size-4" /> Score this match
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-12 rounded-xl px-4 text-[14px] font-semibold"
          >
            <Link to="/match-center/scorebook/$matchId" params={{ matchId: match.id }}>
              <BookOpen className="mr-1.5 size-4" /> Scorecard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function WelcomeHero({
  upcomingCount,
  todaysCount,
  nextMatch,
}: {
  name: string;
  upcomingCount: number;
  todaysCount: number;
  nextMatch?: MatchWithTeams;
}) {
  const line = nextMatch
    ? `Next: ${nextMatch.team_a?.short_name ?? nextMatch.team_a?.name ?? "Team A"} vs ${
        nextMatch.team_b?.short_name ?? nextMatch.team_b?.name ?? "Team B"
      }`
    : todaysCount > 0
      ? `${todaysCount} match${todaysCount === 1 ? "" : "es"} today`
      : upcomingCount > 0
        ? `${upcomingCount} coming up`
        : "No match is live right now";
  return (
    <Link
      to="/match-center/create"
      className="flex items-center gap-3 rounded-2xl p-4 text-white transition-opacity active:opacity-90"
      style={{
        background:
          "linear-gradient(135deg, var(--tenant-brand, var(--brand, #2A7A4B)) 0%, color-mix(in oklch, var(--tenant-brand, var(--brand, #2A7A4B)) 70%, black) 100%)",
      }}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/15 text-2xl">
        🏏
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[19px] font-bold leading-tight tracking-tight">
          Start a match
        </span>
        <span className="block truncate text-[12.5px] opacity-85">{line}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 opacity-80" />
    </Link>
  );
}

function MatchRow({ match, completed }: { match: MatchWithTeams; completed?: boolean }) {
  const teamA = match.team_a?.short_name ?? match.team_a?.name ?? "Team A";
  const teamB = match.team_b?.short_name ?? match.team_b?.name ?? "Team B";
  return (
    <Link
      to="/match-center/matches"
      className="flex items-center gap-3 px-1 py-3 rounded-lg hover:bg-accent/30 transition-colors"
    >
      <div
        className="size-9 shrink-0 rounded-lg grid place-items-center text-[11px] font-semibold"
        style={{
          backgroundColor: completed
            ? "color-mix(in oklch, var(--muted-foreground) 12%, transparent)"
            : "color-mix(in oklch, var(--accent-analytics) 14%, transparent)",
          color: completed ? "var(--muted-foreground)" : "var(--accent-analytics)",
        }}
      >
        {match.match_format ?? "M"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {teamA} <span className="text-muted-foreground">vs</span> {teamB}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {match.scheduled_date
            ? new Date(match.scheduled_date).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })
            : "TBD"}
          {match.ground_name ? ` · ${match.ground_name}` : ""}
        </div>
      </div>
      <StatusChip tone={completed ? "success" : match.status === "live" ? "live" : "analytics"}>
        {match.status ?? "scheduled"}
      </StatusChip>
    </Link>
  );
}

function OnboardingChecklist() {
  const steps = [
    {
      icon: Users2,
      title: "Create your first team",
      description: "Set up a squad — that's the foundation for everything else.",
      to: "/match-center/teams/new",
      cta: "Create team",
    },
    {
      icon: UserPlus,
      title: "Add players",
      description: "Bring your roster into the academy.",
      to: "/match-center/players",
      cta: "Add players",
    },
    {
      icon: ClipboardList,
      title: "Create a match",
      description: "Set format, overs, ground and squads.",
      to: "/match-center/create",
      cta: "Create match",
    },
    {
      icon: Rocket,
      title: "Start scoring",
      description: "Go live with ball-by-ball scoring.",
      to: "/match-center/live",
      cta: "Go live",
    },
  ];
  return (
    <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
      <div className="flex items-start gap-3 mb-6">
        <div
          className="size-10 rounded-2xl grid place-items-center text-white shrink-0"
          style={{ backgroundColor: "var(--tenant-brand, var(--brand, #2A7A4B))" }}
        >
          <Rocket className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">Let's get your academy live</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Four quick steps to your first live match. Takes under 10 minutes.
          </p>
        </div>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title}>
              <Link
                to={s.to}
                className="group flex items-start gap-4 rounded-2xl border border-border bg-background/40 p-4 transition-all hover:border-foreground/20 hover:-translate-y-[1px] hover:shadow-[var(--shadow-elev)]"
              >
                <div className="flex flex-col items-center">
                  <div className="size-8 rounded-full grid place-items-center bg-accent/50 text-xs font-semibold tabular-nums">
                    {i + 1}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="size-4 text-muted-foreground" />
                    <div className="text-sm font-semibold tracking-tight">{s.title}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{s.description}</div>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 group-hover:text-foreground">
                    {s.cta}{" "}
                    <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FixturesTabs({
  live,
  upcoming,
  recent,
}: {
  live: MatchWithTeams[];
  upcoming: MatchWithTeams[];
  recent: MatchWithTeams[];
}) {
  const initial: "live" | "upcoming" | "recent" =
    live.length > 0 ? "live" : upcoming.length > 0 ? "upcoming" : "recent";
  const [tab, setTab] = useState<"live" | "upcoming" | "recent">(initial);

  const tabs = [
    { key: "live" as const, label: "Live", count: live.length, icon: RadioIcon },
    { key: "upcoming" as const, label: "Upcoming", count: upcoming.length, icon: CalendarClock },
    { key: "recent" as const, label: "Recent", count: recent.length, icon: Activity },
  ];

  const list = tab === "live" ? live : tab === "upcoming" ? upcoming : recent;

  return (
    <div>
      <div className="mb-3 inline-flex rounded-full border border-border bg-background/60 p-0.5">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
                (active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <t.icon className="size-3.5" />
              <span>{t.label}</span>
              {t.count > 0 && (
                <span
                  className={
                    "ml-0.5 rounded-full px-1.5 text-[10px] font-semibold tabular-nums " +
                    (active ? "bg-background/20" : "bg-muted text-muted-foreground")
                  }
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={tab === "live" ? RadioIcon : tab === "upcoming" ? CalendarClock : Activity}
          title={
            tab === "live"
              ? "No live matches"
              : tab === "upcoming"
                ? "No upcoming matches"
                : "No completed matches yet"
          }
          description={
            tab === "live"
              ? "Start a match to see it live here."
              : tab === "upcoming"
                ? "Schedule a match to see fixtures here."
                : "Completed matches will appear here."
          }
          actionLabel={tab === "recent" ? undefined : "Create match"}
          actionTo={tab === "recent" ? undefined : "/match-center/create"}
        />
      ) : (
        <div className="divide-y divide-border/60 -mx-1">
          {list.map((m) => (
            <MatchRow key={m.id} match={m} completed={tab === "recent"} />
          ))}
        </div>
      )}
    </div>
  );
}
