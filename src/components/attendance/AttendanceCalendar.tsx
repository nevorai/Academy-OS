import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  calendarKeys,
  fetchBatchSessionDates,
  fetchBatchVisits,
  fetchPlayerVisits,
  groupByStudent,
  monthDays,
  monthLabel,
  playerStates,
  shiftMonth,
  summarize,
  todayISO,
  type DayState,
  type Visit,
} from "@/lib/attendance/calendar";

const DOT: Record<DayState, string> = {
  present: "bg-emerald-500 text-white",
  late: "bg-amber-400 text-amber-950",
  absent: "bg-rose-500/90 text-white",
  none: "bg-muted text-muted-foreground/60",
};

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : null;

export function MonthNav({
  year,
  m0,
  onChange,
}: {
  year: number;
  m0: number;
  onChange: (next: { year: number; m0: number }) => void;
}) {
  const now = new Date();
  const atNow = year === now.getFullYear() && m0 === now.getMonth();
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(year, m0, -1))}
        className="grid size-9 place-items-center rounded-full border border-border/60 active:scale-95"
      >
        <ChevronLeft className="size-4" />
      </button>
      <div className="text-sm font-semibold">{monthLabel(year, m0)}</div>
      <button
        type="button"
        aria-label="Next month"
        disabled={atNow}
        onClick={() => onChange(shiftMonth(year, m0, 1))}
        className="grid size-9 place-items-center rounded-full border border-border/60 active:scale-95 disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-xl border border-border/60 px-2 py-2 text-center">
      <div className={cn("text-lg font-bold leading-none", tone)}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * One player's month. Used on the player profile, the player's own app and the
 * parent's view. `batchId` lets days with no mark show as absent when the batch had a session.
 */
export function PlayerAttendanceCalendar({
  tenantId,
  studentId,
  batchId,
}: {
  tenantId: string;
  studentId: string;
  /** Leave out to look it up from the player's own record. */
  batchId?: string | null;
}) {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), m0: now.getMonth() });
  const [picked, setPicked] = useState<string | null>(null);
  const days = useMemo(() => monthDays(ym.year, ym.m0), [ym]);
  const from = days[0].date;
  const to = days[days.length - 1].date;
  const today = todayISO();

  const q = useQuery({
    queryKey: calendarKeys.player(tenantId, studentId, from),
    staleTime: 30_000,
    queryFn: async () => {
      let batch = batchId ?? null;
      if (batchId === undefined) {
        const { data } = await supabase.from("students").select("batch_id").eq("id", studentId).maybeSingle();
        batch = data?.batch_id ?? null;
      }
      const [visits, sessions] = await Promise.all([
        fetchPlayerVisits(tenantId, studentId, from, to),
        batch ? fetchBatchSessionDates(tenantId, batch, from, to) : Promise.resolve(new Set<string>()),
      ]);
      return { visits, sessions };
    },
  });

  const { states, byDate, summary } = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const v of q.data?.visits ?? []) {
      const arr = map.get(v.session_date) ?? [];
      arr.push(v);
      map.set(v.session_date, arr);
    }
    const st = playerStates(days, map, q.data?.sessions ?? new Set());
    return { states: st, byDate: map, summary: summarize(st, today) };
  }, [q.data, days, today]);

  const lead = days[0].weekday;
  const pickedVisits = picked ? (byDate.get(picked) ?? []) : [];

  return (
    <div className="space-y-3">
      <MonthNav year={ym.year} m0={ym.m0} onChange={(n) => { setYm(n); setPicked(null); }} />
      {q.isLoading ? (
        <Skeleton className="h-56 w-full rounded-2xl" />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <Chip label="Present" value={summary.present} tone="text-emerald-600" />
            <Chip label="Late" value={summary.late} tone="text-amber-600" />
            <Chip label="Absent" value={summary.absent} tone="text-rose-600" />
            <Chip label="Overall" value={summary.pct == null ? "—" : `${summary.pct}%`} tone="text-foreground" />
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-muted-foreground">
            {WEEK.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: lead }).map((_, i) => (
              <div key={`b${i}`} />
            ))}
            {days.map((d) => {
              const s = states[d.date];
              const future = d.date > today;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setPicked(picked === d.date ? null : d.date)}
                  aria-label={`${d.date} ${s}`}
                  className={cn(
                    "grid aspect-square place-items-center rounded-lg text-[12px] font-semibold transition active:scale-95",
                    DOT[s],
                    future && "opacity-40",
                    d.date === today && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    picked === d.date && "outline outline-2 outline-foreground/60",
                  )}
                >
                  {d.day}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <Legend color="bg-emerald-500" label="Present" />
            <Legend color="bg-amber-400" label="Late" />
            <Legend color="bg-rose-500" label="Absent" />
            <Legend color="bg-muted" label="No session" />
          </div>
          {picked && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
              <div className="font-semibold">
                {new Date(picked + "T00:00:00").toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
              </div>
              {pickedVisits.filter((v) => v.check_in_at).length === 0 ? (
                <div className="mt-1 text-muted-foreground">
                  {states[picked] === "absent"
                    ? "Did not attend."
                    : states[picked] === "none"
                      ? "No session that day."
                      : "Marked present."}
                </div>
              ) : (
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {pickedVisits
                    .filter((v) => v.check_in_at)
                    .map((v, i) => (
                      <li key={i}>
                        In {time(v.check_in_at)}
                        {v.check_out_at ? ` · Out ${time(v.check_out_at)}` : " · still in"}
                        {v.duration_minutes ? ` · ${v.duration_minutes} min` : ""}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", color)} />
      {label}
    </span>
  );
}

export interface StripPlayer {
  id: string;
  name: string;
  player_id: string | null;
}

/**
 * A whole batch for a month: one row per player with a strip of day squares.
 * Needs no sideways scrolling, so it reads the same on a phone.
 * Lowest attendance first, so the players who keep missing sessions are on top.
 */
export function BatchAttendanceStrips({
  tenantId,
  batchId,
  players,
  year,
  m0,
  onOpen,
}: {
  tenantId: string;
  batchId: string;
  players: StripPlayer[];
  year: number;
  m0: number;
  onOpen: (p: StripPlayer) => void;
}) {
  const days = useMemo(() => monthDays(year, m0), [year, m0]);
  const from = days[0].date;
  const to = days[days.length - 1].date;
  const today = todayISO();

  const q = useQuery({
    queryKey: calendarKeys.batch(tenantId, batchId, from),
    staleTime: 30_000,
    queryFn: async () => {
      const [visits, sessions] = await Promise.all([
        fetchBatchVisits(tenantId, batchId, from, to),
        fetchBatchSessionDates(tenantId, batchId, from, to),
      ]);
      return { visits, sessions };
    },
  });

  const rows = useMemo(() => {
    const grouped = groupByStudent(q.data?.visits ?? []);
    const sessions = q.data?.sessions ?? new Set<string>();
    return players
      .map((p) => {
        const states = playerStates(days, grouped.get(p.id) ?? new Map(), sessions);
        return { p, states, summary: summarize(states, today) };
      })
      .sort((a, b) => (a.summary.pct ?? 101) - (b.summary.pct ?? 101) || a.p.name.localeCompare(b.p.name));
  }, [q.data, players, days, today]);

  if (q.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (players.length === 0)
    return <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">No players in this batch.</p>;
  const heldDays = q.data?.sessions.size ?? 0;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {heldDays} session day{heldDays === 1 ? "" : "s"} this month · lowest attendance first · tap a player for their calendar
      </p>
      <ul className="divide-y rounded-2xl border bg-card">
        {rows.map(({ p, states, summary }) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onOpen(p)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.name}</div>
                <div
                  className="mt-1.5 grid gap-[2px]"
                  style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                >
                  {days.map((d) => (
                    <span
                      key={d.date}
                      title={`${d.date}: ${states[d.date]}`}
                      className={cn(
                        "h-3 rounded-[3px]",
                        DOT[states[d.date]],
                        d.date > today && "opacity-30",
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="w-12 shrink-0 text-right">
                <div
                  className={cn(
                    "text-sm font-bold",
                    summary.pct == null
                      ? "text-muted-foreground"
                      : summary.pct >= 75
                        ? "text-emerald-600"
                        : summary.pct >= 50
                          ? "text-amber-600"
                          : "text-rose-600",
                  )}
                >
                  {summary.pct == null ? "—" : `${summary.pct}%`}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {summary.present + summary.late}/{summary.held}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
