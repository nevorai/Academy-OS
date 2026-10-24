/**
 * Nevorai Academy V2 — Decision Dashboard (Phase 02.3).
 *
 * Not a reporting dashboard. When the owner or admin opens the app, they
 * see immediately: what's happening now, what needs attention, what to do
 * next. Role-aware. Realtime.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Copy, MessageCircle, QrCode } from "lucide-react";
import { ScanStudentCardDialog } from "@/components/attendance/ScanStudentCardDialog";
import { tenantSiteUrl } from "@/lib/tenant";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import {
  ClipboardCheck,
  IndianRupee,
  Users,
  Inbox,
  ArrowRight,
  UserPlus,
  Swords,
  LogIn,
  LogOut,
  Sparkles,
  AlertCircle,
  TrendingUp,
  Activity,
  Cake,
  
  Megaphone,
  BarChart3,
  Share2,
  CheckCircle2,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { useCurrentRole } from "@/hooks/use-current-role";
import {
  fetchKpis,
  fetchDashboardInsights,
  fetchDashboardActivity,
  fetchBatches,
  fetchStudents,
  qk,
  type ActivityEvent,
} from "@/lib/dashboard-queries";
import {
  attendanceKeys,
  fetchAttendanceToday,
  useAttendanceRealtime,
} from "@/lib/attendance/queries";
import { useNewRegistrationsCount } from "@/hooks/use-new-registrations";
import { getFeatures } from "@/lib/tenant";
import { LiveBadge } from "@/components/ds";
import { Skeleton } from "@/components/ds/States";
import { PersonAvatar } from "@/components/site/PersonAvatar";
import { CricketToday } from "@/components/match-center/widgets/CricketToday";
import { useLiveMatches, type MatchWithTeams } from "@/lib/match-feeds";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Home · Nevorai Academy" },
      {
        name: "description",
        content:
          "Live decision dashboard for your academy — attendance, fees, registrations and today's activity at a glance.",
      },
    ],
  }),
  component: DashboardHome,
});

// ---------------------------------------------------------------------------

const money = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function DashboardHome() {
  const { tenant, profile } = useDashboard();
  const role = useCurrentRole();
  const { can } = usePermissions();
  const features = getFeatures(tenant);
  const qc = useQueryClient();
  const now = new Date();

  const canViewFees = can("canViewFees");
  const canScoreMatch = can("canScoreMatch");
  const feeEnabled = features.fee_tracking !== false;

  // Shared realtime subscription — every attendance widget on this page uses
  // it. One channel per tenant, refcounted.
  useAttendanceRealtime(tenant.id, qc);

  const kpisQ = useQuery({ queryKey: qk.kpis(tenant.id), queryFn: () => fetchKpis(tenant), refetchOnWindowFocus: true });
  const insightsQ = useQuery({
    queryKey: qk.insights(tenant.id),
    queryFn: () => fetchDashboardInsights(tenant.id),
  });
  const attendanceQ = useQuery({
    queryKey: attendanceKeys.today(tenant.id),
    queryFn: () => fetchAttendanceToday(tenant.id),
    staleTime: 15_000,
  });
  const batchesQ = useQuery({
    queryKey: qk.batches(tenant.id),
    queryFn: () => fetchBatches(tenant.id),
  });
  const studentsQ = useQuery({
    queryKey: qk.students(tenant.id),
    queryFn: () => fetchStudents(tenant.id),
    // Only calculate using students that are NOT left/archived
    select: (data) => (data ?? []).filter((s: any) => s.status !== "left"),
  });
  const activityQ = useQuery({
    queryKey: qk.activity(tenant.id),
    queryFn: () => fetchDashboardActivity(tenant.id, { includeFees: canViewFees }),
    staleTime: 30_000,
  });
  const newRegs = useNewRegistrationsCount(tenant.id);
  const liveMatchesQ = useLiveMatches(canScoreMatch ? tenant.id : undefined);
  const liveMatch: MatchWithTeams | undefined = liveMatchesQ.data[0];

  // ── Single source of truth ────────────────────────────────────────────
  // Reuse the exact same engine as the Attendance page (session = "all"):
  //   roster  = active students in active batches
  //   present = students with current_state ∈ { in_academy, checked_out }
  //   pct     = present / roster
  // Any Waiting student counts against the denominator — no divergence.
  const attendanceRows = attendanceQ.data ?? [];
  const activeBatchIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of (batchesQ.data ?? []) as Array<{ id: string; active: boolean }>) {
      if (b.active) set.add(b.id);
    }
    return set;
  }, [batchesQ.data]);
  const rosterStudents = useMemo(
    () =>
      (studentsQ.data ?? []).filter(
        (s: { status: string; batch_id: string | null }) =>
          s.status === "active" && !!s.batch_id && activeBatchIds.has(s.batch_id),
      ),
    [studentsQ.data, activeBatchIds],
  );
  const stateByStudent = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of attendanceRows) {
      if (r.batch_id && activeBatchIds.has(r.batch_id)) m.set(r.student_id, r.current_state);
    }
    return m;
  }, [attendanceRows, activeBatchIds]);
  const inAcademy = useMemo(
    () => attendanceRows.filter((r) => r.current_state === "in_academy").length,
    [attendanceRows],
  );
  const { attPresent, attTotal, attPct } = useMemo(() => {
    let present = 0;
    for (const s of rosterStudents) {
      const state = stateByStudent.get(s.id);
      if (state === "in_academy" || state === "checked_out") present++;
    }
    const total = rosterStudents.length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { attPresent: present, attTotal: total, attPct: pct };
  }, [rosterStudents, stateByStudent]);
  const playersPresent = attPresent;

  const insights = insightsQ.data;
  const kpis = kpisQ.data;
  const pendingFees = kpis?.pendingFeeCount ?? 0;
  const collectedMonth = kpis?.collectionThisMonth ?? 0;
  const attendanceLoading = attendanceQ.isLoading || batchesQ.isLoading || studentsQ.isLoading;

  const displayName = (profile as { display_name?: string })?.display_name ?? tenant.name;
  const greeting = greetingFor(now);

  // Pending actions for admins = new regs + not-yet-arrived count.
  // Derived from the same roster as the Attendance page — never a separate calc.
  const notArrived = Math.max(0, attTotal - attPresent);
  const pendingActions = newRegs + (notArrived > 0 ? 1 : 0);

  const showMoney = role === "owner" && feeEnabled;
  const pendingHint =
    pendingFees > 0 ? `${pendingFees} student${pendingFees === 1 ? "" : "s"}` : "All caught up";

  // Metrol's rule: tiles fill their row. Five tiles take 2 / 3 / 5 columns (5 only from 1280 px, where the labels fit) with the last one stretching.
  const tiles: React.ReactNode[] = [];
  if (showMoney) {
    tiles.push(
      <KpiTile
        key="collected"
        to="/dashboard/fees"
        label="Collected"
        value={kpisQ.isLoading ? null : money(collectedMonth)}
        hint="This month"
        tone="brand"
      />,
      <KpiTile
        key="pending"
        to="/dashboard/fees"
        search={{ filter: "pending" }}
        label="Pending fees"
        value={kpisQ.isLoading ? null : money(pendingFees > 0 ? (kpis?.pendingFeeAmount ?? 0) : 0)}
        hint={pendingHint}
        tone={pendingFees > 0 ? "warn" : "muted"}
      />,
    );
  }
  tiles.push(
    <KpiTile
      key="in"
      to="/dashboard/attendance"
      label="In academy now"
      value={attendanceLoading ? null : inAcademy}
      hint="Live"
      tone="live"
      pulse={inAcademy > 0}
    />,
  );
  if (!showMoney) {
    tiles.push(
      <KpiTile
        key="present"
        to="/dashboard/attendance"
        label="Players present"
        value={attendanceLoading ? null : playersPresent}
        hint={`of ${attTotal}`}
        tone="brand"
      />,
    );
  }
  tiles.push(
    <KpiTile
      key="att"
      to="/dashboard/attendance"
      label="Attendance"
      value={attendanceLoading ? null : `${attPct}%`}
      hint={attTotal > 0 ? `${attPresent}/${attTotal} today` : "No marks yet"}
      tone={attPct >= 80 ? "success" : attPct >= 60 ? "warn" : "muted"}
    />,
    role === "owner" ? (
      <KpiTile
        key="regs"
        to="/dashboard/registrations"
        label="New registrations"
        value={newRegs}
        hint={newRegs > 0 ? "Needs review" : "Inbox clear"}
        tone={newRegs > 0 ? "warn" : "muted"}
      />
    ) : (
      <KpiTile
        key="actions"
        to="/dashboard/registrations"
        label="Pending actions"
        value={pendingActions}
        hint={pendingActions > 0 ? "Review inbox" : "Nothing pending"}
        tone={pendingActions > 0 ? "warn" : "muted"}
      />
    ),
  );
  const tileGrid =
    tiles.length === 5
      ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-5 [&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1"
      : "grid-cols-2 lg:grid-cols-4";

  return (
    <div className="space-y-4 pb-2">
      {/* Title line: the greeting, the date and the page's own actions share one row. */}
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="truncate text-xl font-semibold tracking-tight">{greeting}</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">{format(now, "EEE, d MMM")}</span>
        </div>
        <span className="hidden sm:block">
          <LiveBadge state="live" />
        </span>
        <div className="ml-auto">
          <HeaderActions canScoreMatch={canScoreMatch} tenant={tenant} />
        </div>
      </div>

      {/* Live match jump-in · single most time-sensitive action */}
      {canScoreMatch && liveMatch ? <LiveMatchBanner match={liveMatch} /> : null}

      <section aria-label="Today at a glance">
        <div className={cn("grid gap-2.5", tileGrid)}>{tiles}</div>
      </section>

      {/* ─── Section 3 · Cricket today (moved below Quick actions) ────── */}
      {canScoreMatch && (
        <CricketToday tenantId={tenant.id} playerCount={(studentsQ.data ?? []).length} />
      )}

      {/* ─── Section 4 · Today's activity (compact, scrollable) ───────── */}
      <section aria-label="Today's activity">
        <SectionLabel action={<HeaderLink to="/dashboard/attendance">Open</HeaderLink>}>
          Recent activity
        </SectionLabel>
        <ActivityFeed query={activityQ} canViewFees={canViewFees} />
      </section>

      {/* ─── Section 5 · Next actions (actionable only, no duplicate KPIs) */}
      <section aria-label="Next actions">
        <SectionLabel>Next actions</SectionLabel>
        <NextActions
          notArrived={notArrived}
          pendingFees={canViewFees && feeEnabled ? pendingFees : 0}
          newRegs={newRegs}
          birthdaysToday={(insights?.birthdays ?? []).filter((b) => b.daysAway === 0).length}
          isLoading={attendanceLoading || insightsQ.isLoading || kpisQ.isLoading}
        />
      </section>
    </div>
  );
}


// ---------------------------------------------------------------------------

// Live match banner — one-tap jump into scoring when a match is in progress.
// Rendered only when the tenant has Match Center enabled AND a match is live.
// ---------------------------------------------------------------------------

function LiveMatchBanner({ match }: { match: MatchWithTeams }) {
  const a = match.team_a?.short_name ?? match.team_a?.name ?? "Team A";
  const b = match.team_b?.short_name ?? match.team_b?.name ?? "Team B";
  return (
    <Link
      to="/scorer/$matchId"
      params={{ matchId: match.id }}
      className={cn(
        "flex items-center justify-between gap-3 rounded-[7px] px-4 py-3",
        "border border-t-2 border-border border-t-red-500 bg-card",
        "transition-colors hover:border-red-500/60",
      )}
      aria-label={`Live match ${a} versus ${b} — open scoring`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="relative inline-flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full rounded-full bg-red-500 opacity-70 animate-ping" />
          <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
            Live now
          </div>
          <div className="mt-0.5 text-sm font-semibold tracking-tight truncate">
            {a} vs {b} · Tap to score
          </div>
        </div>
      </div>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-red-500 text-white"
        aria-hidden
      >
        <Radio className="size-4" />
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// UI primitives (page-scoped) — small, purposeful, no oversized cards.
// ---------------------------------------------------------------------------

type Tone = "brand" | "success" | "warn" | "muted" | "live";

function toneColor(tone: Tone): string {
  switch (tone) {
    case "success":
      return "var(--accent-success, #10b981)";
    case "warn":
      return "#f59e0b";
    case "live":
      return "#10b981";
    case "muted":
      return "hsl(var(--muted-foreground))";
    default:
      return "var(--brand, #E8873C)";
  }
}

function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-0.5 mb-2">
      <h2 className="text-[11px] uppercase tracking-[0.07em] font-semibold text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

function HeaderLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
    >
      {children} <ArrowRight className="size-3" />
    </Link>
  );
}

function KpiTile({
  to,
  search,
  label,
  value,
  hint,
  tone = "brand",
  pulse,
}: {
  to: string;
  search?: Record<string, string>;
  label: string;
  value: number | string | null;
  hint?: string;
  tone?: Tone;
  pulse?: boolean;
}) {
  const color = toneColor(tone);
  return (
    <Link
      to={to}
      search={search as never}
      style={{ borderTopColor: tone === "muted" ? "var(--foreground)" : color }}
      className={cn(
        "flex min-h-[92px] flex-col gap-2 rounded-[7px] border border-t-2 border-border bg-card px-3.5 pb-3.5 pt-3",
        "outline-none transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {label}
        </span>
        {pulse ? (
          <span className="relative inline-flex size-2 shrink-0">
            <span
              className="absolute inline-flex size-full animate-ping rounded-full opacity-70"
              style={{ backgroundColor: color }}
            />
            <span className="relative inline-flex size-2 rounded-full" style={{ backgroundColor: color }} />
          </span>
        ) : null}
      </div>
      <div
        className="text-[26px] font-semibold leading-none tracking-tight tabular-nums"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value === null ? <Skeleton className="h-6 w-14" /> : value}
      </div>
      {hint ? <div className="truncate text-[11.5px] text-muted-foreground">{hint}</div> : null}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// The page's own actions sit on the title line (Metrol's layout law), not in a row of their own.
// Players and Reports are already in the sidebar, so only what the sidebar cannot do is here.
// ---------------------------------------------------------------------------

const HEADER_BTN = cn(
  "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-[7px] border border-border bg-card px-2.5 text-[12.5px] font-semibold md:h-8 md:min-w-0",
  "outline-none transition-colors hover:border-foreground/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]",
);

function HeaderActions({
  canScoreMatch,
  tenant,
}: {
  canScoreMatch: boolean;
  tenant: { slug: string; name: string; custom_domain: string | null };
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Phones have the Scan button in the bottom bar already. */}
        <button type="button" className={cn(HEADER_BTN, "hidden md:inline-flex")} onClick={() => setScanOpen(true)}>
          <QrCode className="size-3.5" /> Scan QR
        </button>
        {canScoreMatch ? (
          <Link to="/match-center/create" className={HEADER_BTN} aria-label="Create match">
            <Swords className="size-3.5" />
            <span className="hidden sm:inline">Create match</span>
          </Link>
        ) : null}
        <button type="button" className={HEADER_BTN} onClick={() => setShareOpen(true)} aria-label="Share website">
          <Share2 className="size-3.5" />
          <span className="hidden sm:inline">Share website</span>
        </button>
      </div>
      <ShareWebsiteDialog open={shareOpen} onOpenChange={setShareOpen} tenant={tenant} />
      <ScanStudentCardDialog open={scanOpen} onOpenChange={setScanOpen} />
    </>
  );
}

function ShareWebsiteDialog({
  open,
  onOpenChange,
  tenant,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: { slug: string; name: string; custom_domain: string | null };
}) {
  const url = tenantSiteUrl(tenant);
  const message = `Check out ${tenant.name} — ${url}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: url });
    } catch {
      toast.error("Couldn't copy link");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share your website</DialogTitle>
          <DialogDescription className="truncate">{url}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent/40 active:scale-[0.99] transition-all"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--brand,#E8873C)_14%,transparent)] text-[color:var(--brand,#E8873C)]">
              <Copy className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Copy link</div>
              <div className="text-[11px] text-muted-foreground truncate">Copy the public site URL</div>
            </div>
          </button>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/40 active:scale-[0.99] transition-all"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <MessageCircle className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Share on WhatsApp</div>
              <div className="text-[11px] text-muted-foreground truncate">Send with a pre-filled message</div>
            </div>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

function ActivityFeed({
  query,
  canViewFees,
}: {
  query: ReturnType<typeof useQuery<ActivityEvent[]>>;
  canViewFees: boolean;
}) {
  if (query.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground flex items-center justify-between gap-3">
        <span>Couldn't load activity.</span>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="font-semibold text-foreground hover:opacity-80"
        >
          Retry
        </button>
      </div>
    );
  }
  const events = (query.data ?? []).filter((e) => (canViewFees ? true : e.kind !== "payment"));
  if (events.length === 0) {
    return (
      <Link
        to="/dashboard/attendance"
        className="block rounded-2xl border border-border bg-card px-4 py-6 text-center hover:bg-accent/40 active:scale-[0.99] transition-all"
      >
        <div className="mx-auto grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
          <Activity className="size-4" />
        </div>
        <div className="mt-2 text-sm font-semibold">Nothing in the last day</div>
        <div className="text-[11px] text-muted-foreground">
          Check-ins, registrations and fees appear here as they happen.
        </div>
      </Link>
    );
  }

  // Show all of today's events, but cap the panel height so ~5-6 rows are
  // visible and the rest scroll inside. Keeps Home compact even on very
  // busy days (50+ events).
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <ul className="divide-y divide-border/60 max-h-[336px] overflow-y-auto overscroll-contain">
        {events.map((e) => (
          <ActivityRow key={e.id} event={e} />
        ))}
      </ul>
    </div>
  );
}

/** Clock time for today; "Yesterday 9:15 AM" or "9 Oct, 9:15 AM" for older entries (the feed keeps 36 hours). */
function activityWhen(iso: string): string {
  const d = new Date(iso);
  const time = format(d, "h:mm a");
  if (isToday(d)) return time;
  if (isYesterday(d)) return `Yesterday ${time}`;
  return `${format(d, "d MMM")}, ${time}`;
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const meta = activityMeta(event.kind);
  const body = (
    <>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full"
        style={{
          backgroundColor: `color-mix(in oklab, ${meta.color} 15%, transparent)`,
          color: meta.color,
        }}
        aria-hidden
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate">{event.actorName}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {event.detail}
          {event.amount != null ? ` · ${money(event.amount)}` : ""}
        </div>
      </div>
      <time className="text-[10.5px] text-muted-foreground tabular-nums shrink-0">
        {activityWhen(event.at)}
      </time>
    </>
  );

  if (event.href) {
    return (
      <li>
        <Link
          to={event.href}
          className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 transition-colors"
        >
          {body}
        </Link>
      </li>
    );
  }
  return <li className="flex items-center gap-3 px-3 py-2.5">{body}</li>;
}

function activityMeta(kind: ActivityEvent["kind"]): {
  color: string;
  icon: React.ReactNode;
} {
  switch (kind) {
    case "check_in":
      return { color: "#10b981", icon: <LogIn className="size-4" /> };
    case "check_out":
      return { color: "#0ea5e9", icon: <LogOut className="size-4" /> };
    case "payment":
      return { color: "#f59e0b", icon: <IndianRupee className="size-4" /> };
    case "registration":
      return { color: "var(--brand, #E8873C)", icon: <UserPlus className="size-4" /> };
  }
}

// ---------------------------------------------------------------------------
// Next actions — actionable items only. Never duplicates a KPI above.
// ---------------------------------------------------------------------------

type NextAction = {
  key: string;
  to: string;
  search?: Record<string, string>;
  title: string;
  cta: string;
  tone: Tone;
  icon: React.ReactNode;
};

function NextActions({
  notArrived,
  pendingFees,
  newRegs,
  birthdaysToday,
  isLoading,
}: {
  notArrived: number;
  pendingFees: number;
  newRegs: number;
  birthdaysToday: number;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const items: NextAction[] = [];
  if (notArrived > 0) {
    items.push({
      key: "attendance",
      to: "/dashboard/attendance",
      title: `${notArrived} ${notArrived === 1 ? "player" : "players"} still waiting for attendance`,
      cta: "Open Attendance",
      tone: "warn",
      icon: <ClipboardCheck className="size-4" />,
    });
  }
  if (pendingFees > 0) {
    items.push({
      key: "fees",
      to: "/dashboard/fees",
      search: { filter: "pending" },
      title: `${pendingFees} fee ${pendingFees === 1 ? "collection" : "collections"} pending`,
      cta: "Open Fees",
      tone: "warn",
      icon: <IndianRupee className="size-4" />,
    });
  }
  if (newRegs > 0) {
    items.push({
      key: "regs",
      to: "/dashboard/registrations",
      title: `${newRegs} new ${newRegs === 1 ? "registration" : "registrations"} waiting`,
      cta: "Open Registrations",
      tone: "brand",
      icon: <Inbox className="size-4" />,
    });
  }
  if (birthdaysToday > 0) {
    items.push({
      key: "bday",
      to: "/dashboard/students",
      title: `${birthdaysToday} ${birthdaysToday === 1 ? "birthday" : "birthdays"} today`,
      cta: "Wish them",
      tone: "success",
      icon: <Cake className="size-4" />,
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-5 text-center">
        <div className="mx-auto grid size-9 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
        </div>
        <div className="mt-2 text-sm font-semibold">Everything looks good today 🎉</div>
        <div className="text-[11px] text-muted-foreground">
          No pending actions. You're all caught up.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <ul className="divide-y divide-border/60">
        {items.map((a) => (
          <li key={a.key}>
            <Link
              to={a.to}
              search={a.search as never}
              className="flex items-center gap-3 px-3 py-3 hover:bg-accent/40 active:scale-[0.99] transition-all"
            >
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full"
                style={{
                  backgroundColor: `color-mix(in oklab, ${toneColor(a.tone)} 15%, transparent)`,
                  color: toneColor(a.tone),
                }}
                aria-hidden
              >
                {a.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate">{a.title}</div>
                <div className="text-[11px] text-muted-foreground truncate">{a.cta}</div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
