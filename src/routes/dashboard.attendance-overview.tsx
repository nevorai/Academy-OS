/**
 * Owner's attendance overview: who is in the academy now, who left and when, and how every player
 * is doing this month. Three tabs, all loaded together so switching is instant:
 *   Today  - live board (in now / left / not yet) with arrival and leaving times
 *   Month  - players per day (bars), average attendance, best and weakest
 *   Players - every player: days came, average arrival time, tap to see each day
 * Phone first: one column, big text; desktop uses the full width in 3 columns.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Search,
  CalendarDays,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { Skeleton } from "@/components/ui/skeleton";
import { ModuleHeader } from "@/components/shared/ModuleHeader";
import { cn } from "@/lib/utils";
import { fetchStudents, qk } from "@/lib/dashboard-queries";
import {
  attendanceKeys,
  fetchAttendanceToday,
  useAttendanceRealtime,
  type AttendanceTodayRow,
} from "@/lib/attendance/queries";
import {
  calendarKeys,
  fetchMonthVisits,
  isoDate,
  monthDays,
  monthLabel,
  shiftMonth,
  todayISO,
  type Visit,
} from "@/lib/attendance/calendar";
import {
  clockLabel,
  dailyCounts,
  heldDates,
  pctOf,
  playerStats,
  timeOf,
  type PlayerStat,
} from "@/lib/attendance/overview";
import { formatDuration } from "@/lib/attendance/constants";

export const Route = createFileRoute("/dashboard/attendance-overview")({
  head: () => ({
    meta: [{ title: "Attendance overview" }, { name: "robots", content: "noindex" }],
  }),
  component: AttendanceOverview,
  errorComponent: () => (
    <div className="mx-auto max-w-xl space-y-3 p-6 text-center">
      <h1 className="text-xl font-semibold">This page could not open</h1>
      <p className="text-base text-muted-foreground">
        Please try again. You can still mark attendance.
      </p>
      <Link
        to="/dashboard/attendance"
        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground"
      >
        Mark attendance
      </Link>
    </div>
  ),
});

type Tab = "today" | "month" | "players";
const TAB_KEY = "attendance-overview-tab";
const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "month", label: "This month" },
  { id: "players", label: "Players" },
];

type StudentRow = {
  id: string;
  name: string;
  status: string | null;
  batches?: { name: string } | null;
};

type Merged = {
  state: "in" | "left" | "absent" | "none";
  inAt: string | null;
  outAt: string | null;
  minutes: number;
};

/** One row per player for today (a player can have rows in several sessions). */
function mergeToday(rows: AttendanceTodayRow[]): Map<string, Merged> {
  const rank = { in: 3, left: 2, absent: 1, none: 0 } as const;
  const out = new Map<string, Merged>();
  for (const r of rows) {
    const state: Merged["state"] =
      r.current_state === "in_academy"
        ? "in"
        : r.current_state === "checked_out"
          ? "left"
          : r.current_state === "absent"
            ? "absent"
            : "none";
    const prev = out.get(r.student_id);
    if (!prev) {
      out.set(r.student_id, {
        state,
        inAt: r.check_in_at,
        outAt: r.check_out_at,
        minutes: r.duration_minutes ?? 0,
      });
      continue;
    }
    out.set(r.student_id, {
      state: rank[state] > rank[prev.state] ? state : prev.state,
      inAt: [prev.inAt, r.check_in_at].filter(Boolean).sort()[0] ?? null,
      outAt: [prev.outAt, r.check_out_at].filter(Boolean).sort().slice(-1)[0] ?? null,
      minutes: prev.minutes + (r.duration_minutes ?? 0),
    });
  }
  return out;
}

function AttendanceOverview() {
  const { tenant } = useDashboard();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("today");
  const [q, setQ] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [ym, setYm] = useState(() => {
    const t = todayISO();
    return { year: Number(t.slice(0, 4)), m0: Number(t.slice(5, 7)) - 1 };
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as Tab | null;
      if (saved && TABS.some((t) => t.id === saved)) setTab(saved);
    } catch {
      /* private window: start on Today */
    }
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  };

  useAttendanceRealtime(tenant.id, qc);

  const studentsQ = useQuery({
    queryKey: qk.students(tenant.id),
    queryFn: () => fetchStudents(tenant.id),
  });
  const todayQ = useQuery({
    queryKey: attendanceKeys.today(tenant.id),
    queryFn: () => fetchAttendanceToday(tenant.id),
    staleTime: 15_000,
  });
  const days = useMemo(() => monthDays(ym.year, ym.m0), [ym]);
  const from = days[0]!.date;
  const to = days[days.length - 1]!.date;
  const monthQ = useQuery({
    queryKey: calendarKeys.month(tenant.id, from),
    queryFn: () => fetchMonthVisits(tenant.id, from, to),
    staleTime: 60_000,
  });

  const students = useMemo(
    () =>
      ((studentsQ.data ?? []) as unknown as StudentRow[]).filter(
        (s) => s.status === "active" || s.status == null,
      ),
    [studentsQ.data],
  );
  const today = todayISO();
  const loading = studentsQ.isLoading || todayQ.isLoading;

  // ---- Today
  const merged = useMemo(() => mergeToday(todayQ.data ?? []), [todayQ.data]);
  const needle = q.trim().toLowerCase();
  const match = (s: StudentRow) =>
    !needle ||
    s.name.toLowerCase().includes(needle) ||
    (s.batches?.name ?? "").toLowerCase().includes(needle);
  const groups = useMemo(() => {
    const inNow: StudentRow[] = [];
    const left: StudentRow[] = [];
    const notYet: StudentRow[] = [];
    for (const s of students) {
      const st = merged.get(s.id)?.state ?? "none";
      (st === "in" ? inNow : st === "left" ? left : notYet).push(s);
    }
    const byIn = (a: StudentRow, b: StudentRow) =>
      (merged.get(a.id)?.inAt ?? "").localeCompare(merged.get(b.id)?.inAt ?? "");
    inNow.sort(byIn);
    left.sort(byIn);
    notYet.sort((a, b) => a.name.localeCompare(b.name));
    return { inNow, left, notYet };
  }, [students, merged]);

  // ---- Month
  const visits = useMemo<Visit[]>(() => monthQ.data ?? [], [monthQ.data]);
  const held = useMemo(() => heldDates(visits, today), [visits, today]);
  const counts = useMemo(
    () =>
      dailyCounts(
        visits,
        days.map((d) => d.date),
      ),
    [visits, days],
  );
  const stats = useMemo(() => playerStats(visits), [visits]);
  const [pickedDay, setPickedDay] = useState<number | null>(null);
  const maxBar = Math.max(1, students.length, ...counts);
  const avgPct = useMemo(() => {
    if (!held.length || !students.length) return null;
    const heldCounts = dailyCounts(visits, held);
    const total = heldCounts.reduce((a, b) => a + b, 0);
    return Math.min(100, Math.round((total / (held.length * students.length)) * 100));
  }, [held, visits, students.length]);

  const ranked = useMemo(
    () =>
      students
        .map((s) => ({ s, st: stats.get(s.id) as PlayerStat | undefined }))
        .map(({ s, st }) => ({ s, st, pct: pctOf(st?.days ?? 0, held.length) }))
        .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.s.name.localeCompare(b.s.name)),
    [students, stats, held.length],
  );
  const needsAttention = ranked.filter((r) => r.pct !== null).slice(0, 5);
  const mostRegular = [...ranked]
    .filter((r) => r.pct !== null)
    .reverse()
    .slice(0, 5);

  const [open, setOpen] = useState<string | null>(null);
  const byStudent = useMemo(() => {
    const m = new Map<string, Visit[]>();
    for (const v of visits) {
      const a = m.get(v.student_id) ?? [];
      a.push(v);
      m.set(v.student_id, a);
    }
    return m;
  }, [visits]);

  const isThisMonth =
    ym.year === Number(today.slice(0, 4)) && ym.m0 === Number(today.slice(5, 7)) - 1;

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-2.5 px-1 pb-24">
      <ModuleHeader
        title="Attendance"
        backTo="/dashboard"
        className="!mb-0"
        action={
          <>
            <Link
              to="/dashboard/attendance-calendar"
              aria-label="Month calendar"
              className="grid size-9 place-items-center rounded-[9px] border border-border bg-card active:scale-95"
            >
              <CalendarDays className="size-[18px]" />
            </Link>
            <Link
              to="/dashboard/attendance"
              className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground active:scale-95"
            >
              <ClipboardCheck className="size-4" /> Mark attendance
            </Link>
          </>
        }
      />

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Attendance views"
        className="flex gap-0.5 overflow-x-auto rounded-xl border border-border bg-card p-0.5"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pick(t.id)}
            className={cn(
              "min-h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-[13.5px] font-semibold transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          {/* ───────────── TODAY ───────────── */}
          <section hidden={tab !== "today"} aria-label="Today" className="space-y-2.5">
            <div className="grid grid-cols-4 gap-1.5 md:gap-3">
              <Kpi label="In now" value={groups.inNow.length} tone="green" />
              <Kpi label="Came" value={groups.inNow.length + groups.left.length} />
              <Kpi label="Left" value={groups.left.length} />
              <Kpi
                label="Not yet"
                value={groups.notYet.length}
                tone={groups.notYet.length ? "amber" : undefined}
              />
            </div>

            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a player or batch"
                className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[16px]"
              />
            </label>

            <div className="grid gap-2.5 lg:grid-cols-3">
              <Column
                title="In the academy now"
                empty="Nobody is here right now."
                tone="green"
                count={groups.inNow.filter(match).length}
              >
                {groups.inNow.filter(match).map((s) => {
                  const m = merged.get(s.id)!;
                  const mins = m.inAt
                    ? Math.max(0, Math.round((now - new Date(m.inAt).getTime()) / 60000))
                    : 0;
                  return (
                    <PlayerLine
                      key={s.id}
                      name={s.name}
                      sub={s.batches?.name}
                      right={`Came ${timeOf(m.inAt)}`}
                      note={`Here for ${formatDuration(mins)}`}
                    />
                  );
                })}
              </Column>
              <Column
                title="Left"
                empty="Nobody has left yet."
                count={groups.left.filter(match).length}
              >
                {groups.left.filter(match).map((s) => {
                  const m = merged.get(s.id)!;
                  return (
                    <PlayerLine
                      key={s.id}
                      name={s.name}
                      sub={s.batches?.name}
                      right={`${timeOf(m.inAt)} to ${timeOf(m.outAt)}`}
                      note={`Total ${formatDuration(m.minutes)}`}
                    />
                  );
                })}
              </Column>
              <Column
                title="Not come yet"
                empty="Everyone has come."
                tone="amber"
                count={groups.notYet.filter(match).length}
              >
                {groups.notYet.filter(match).map((s) => (
                  <PlayerLine
                    key={s.id}
                    name={s.name}
                    sub={s.batches?.name}
                    right={merged.get(s.id)?.state === "absent" ? "Marked absent" : "Waiting"}
                  />
                ))}
              </Column>
            </div>
          </section>

          {/* ───────────── MONTH ───────────── */}
          <section hidden={tab !== "month"} aria-label="This month" className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-2">
              <button
                aria-label="Previous month"
                className="grid size-11 place-items-center rounded-lg hover:bg-accent/50"
                onClick={() => {
                  setPickedDay(null);
                  setYm((c) => shiftMonth(c.year, c.m0, -1));
                }}
              >
                <ChevronLeft className="size-5" />
              </button>
              <div className="text-lg font-semibold">{monthLabel(ym.year, ym.m0)}</div>
              <button
                aria-label="Next month"
                disabled={isThisMonth}
                className="grid size-11 place-items-center rounded-lg hover:bg-accent/50 disabled:opacity-30"
                onClick={() => {
                  setPickedDay(null);
                  setYm((c) => shiftMonth(c.year, c.m0, 1));
                }}
              >
                <ChevronRight className="size-5" />
              </button>
            </div>

            {monthQ.isLoading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Kpi
                    label="Average attendance"
                    value={avgPct === null ? "–" : `${avgPct}%`}
                    tone="green"
                  />
                  <Kpi label="Days the academy ran" value={held.length} />
                  <Kpi label="Total check-ins" value={counts.reduce((a, b) => a + b, 0)} />
                  <Kpi label="Active players" value={students.length} />
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold">Players who came, day by day</h2>
                    <span className="text-sm text-muted-foreground">
                      {pickedDay !== null
                        ? `${pickedDay} ${monthLabel(ym.year, ym.m0).split(" ")[0]}: ${counts[pickedDay - 1]} players`
                        : "Tap a bar"}
                    </span>
                  </div>
                  <div
                    className="flex h-44 items-end gap-[3px] md:h-56"
                    role="img"
                    aria-label="Players per day this month"
                  >
                    {days.map((d, i) => {
                      const future = d.date > today;
                      const h = Math.round((counts[i]! / maxBar) * 100);
                      return (
                        <button
                          key={d.date}
                          aria-label={`${d.day}: ${counts[i]} players`}
                          onClick={() => setPickedDay(d.day)}
                          className="flex h-full min-w-0 flex-1 flex-col justify-end"
                        >
                          <span
                            className={cn(
                              "w-full rounded-t-sm",
                              future ? "bg-muted/60" : counts[i] ? "bg-primary" : "bg-muted",
                              pickedDay === d.day && "ring-2 ring-foreground/60",
                            )}
                            style={{ height: `${future ? 4 : Math.max(counts[i] ? 6 : 3, h)}%` }}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1 flex gap-[3px] text-[11px] text-muted-foreground">
                    {days.map((d) => (
                      <span key={d.date} className="min-w-0 flex-1 text-center">
                        {d.day === 1 || d.day % 5 === 0 ? d.day : ""}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <RankList
                    title="Needs a call"
                    hint="Lowest attendance"
                    rows={needsAttention}
                    tone="amber"
                  />
                  <RankList
                    title="Most regular"
                    hint="Best attendance"
                    rows={mostRegular}
                    tone="green"
                  />
                </div>
              </>
            )}
          </section>

          {/* ───────────── PLAYERS ───────────── */}
          <section hidden={tab !== "players"} aria-label="Players" className="space-y-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a player"
                className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[16px]"
              />
            </label>
            <p className="text-sm text-muted-foreground">
              {monthLabel(ym.year, ym.m0)} · the academy ran {held.length} day
              {held.length === 1 ? "" : "s"}. Tap a player to see each day.
            </p>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {ranked
                .filter(({ s }) => match(s))
                .map(({ s, st, pct }) => {
                  const isOpen = open === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setOpen(isOpen ? null : s.id)}
                        aria-expanded={isOpen}
                        className="flex min-h-[64px] w-full items-center gap-3 p-3.5 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-semibold">{s.name}</div>
                          <div className="truncate text-sm text-muted-foreground">
                            {s.batches?.name ?? "No batch"} ·{" "}
                            {st ? `${st.days} of ${held.length} days` : "Not come this month"}
                            {st?.avgArrival != null
                              ? ` · usually ${clockLabel(st.avgArrival)}`
                              : ""}
                          </div>
                        </div>
                        <Pct pct={pct} />
                        <ChevronDown
                          className={cn(
                            "size-5 shrink-0 text-muted-foreground transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {isOpen && (
                        <div className="border-t border-border bg-muted/30 px-3.5 py-3">
                          {(byStudent.get(s.id) ?? []).filter((v) => v.check_in_at).length === 0 ? (
                            <p className="text-sm text-muted-foreground">No visits this month.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {(byStudent.get(s.id) ?? [])
                                .filter((v) => v.check_in_at)
                                .sort((a, b) =>
                                  (b.check_in_at ?? "").localeCompare(a.check_in_at ?? ""),
                                )
                                .map((v, i) => (
                                  <li
                                    key={i}
                                    className="flex flex-wrap items-center justify-between gap-2 text-base"
                                  >
                                    <span className="font-medium">
                                      {Number(v.session_date.slice(8))}{" "}
                                      {monthLabel(ym.year, ym.m0).split(" ")[0]}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {timeOf(v.check_in_at)} to{" "}
                                      {v.check_out_at
                                        ? timeOf(v.check_out_at)
                                        : "still here / not marked"}
                                      {v.duration_minutes
                                        ? ` · ${formatDuration(v.duration_minutes)}`
                                        : ""}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "green" | "amber";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-1.5 py-2 text-center md:p-4 md:text-left">
      <div className="text-[11px] font-medium text-muted-foreground md:text-sm">{label}</div>
      <div
        className={cn(
          "text-[22px] font-bold leading-tight tabular-nums md:mt-1 md:text-3xl",
          tone === "green" && "text-emerald-600",
          tone === "amber" && "text-amber-600",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Column({
  title,
  count,
  empty,
  tone,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  tone?: "green" | "amber";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[12px] font-semibold",
            tone === "green"
              ? "bg-emerald-100 text-emerald-800"
              : tone === "amber"
                ? "bg-amber-100 text-amber-800"
                : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="px-3 py-2.5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </div>
  );
}

function PlayerLine({
  name,
  sub,
  right,
  note,
}: {
  name: string;
  sub?: string | null;
  right: string;
  note?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold leading-tight">{name}</div>
        <div className="truncate text-[12.5px] text-muted-foreground">{sub ?? "No batch"}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[14px] font-medium">{right}</div>
        {note && <div className="text-[12px] text-muted-foreground">{note}</div>}
      </div>
    </li>
  );
}

function Pct({ pct }: { pct: number | null }) {
  if (pct === null)
    return <span className="w-14 shrink-0 text-right text-sm text-muted-foreground">–</span>;
  return (
    <span
      className={cn(
        "w-14 shrink-0 rounded-full px-2 py-1 text-center text-sm font-bold tabular-nums",
        pct >= 75
          ? "bg-emerald-100 text-emerald-800"
          : pct >= 50
            ? "bg-amber-100 text-amber-800"
            : "bg-red-100 text-red-800",
      )}
    >
      {pct}%
    </span>
  );
}

function RankList({
  title,
  hint,
  rows,
  tone,
}: {
  title: string;
  hint: string;
  rows: { s: StudentRow; st: PlayerStat | undefined; pct: number | null }[];
  tone: "green" | "amber";
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-3.5">
        <h2
          className={cn(
            "text-lg font-semibold",
            tone === "amber" ? "text-amber-700" : "text-emerald-700",
          )}
        >
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-base text-muted-foreground">Not enough days yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(({ s, st, pct }) => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{s.name}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {s.batches?.name ?? "No batch"} · came {st?.days ?? 0} days
                </div>
              </div>
              <Pct pct={pct} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
