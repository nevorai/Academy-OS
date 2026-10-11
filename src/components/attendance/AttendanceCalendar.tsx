import { useMemo, useState, type ReactNode } from "react";
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
  dayRows,
  playerStates,
  practiceMinutes,
  shiftMonth,
  summarize,
  sundayLead,
  todayISO,
  type DayRow,
  type DayState,
  type Visit,
} from "@/lib/attendance/calendar";
import { formatDuration } from "@/lib/attendance/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DOT: Record<DayState, string> = {
  present: "bg-emerald-500 text-white",
  late: "bg-amber-400 text-amber-950",
  absent: "bg-rose-500/90 text-white",
  none: "bg-muted text-muted-foreground/60",
};

const WEEK_SUN = ["S", "M", "T", "W", "T", "F", "S"];

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

/** The ring of months a player can look back at: this month, last month, then four more. */
function monthChoices(now = new Date()) {
  return Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(now.getFullYear(), now.getMonth(), -i);
    const label = i === 0 ? "This month" : i === 1 ? "Last month" : monthLabel(m.year, m.m0);
    return { value: `${m.year}-${m.m0}`, label, ...m };
  });
}

const STATE_WORD: Record<DayState, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  none: "No practice",
};

const dayLabel = (date: string) =>
  new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

/**
 * The month view, laid out like the Metrol CRM Attendance tab: month picker, coloured
 * day squares (green present, amber late, red absent), the counts, then a table of days.
 */
export function AttendanceMonthView({
  ym,
  onMonth,
  days,
  states,
  rows,
  summary,
  practice,
  today,
  picked,
  onPick,
  top,
}: {
  /** Shown between the title row and the calendar (the player's "today" card). */
  top?: ReactNode;
  ym: { year: number; m0: number };
  onMonth: (next: { year: number; m0: number }) => void;
  days: ReturnType<typeof monthDays>;
  states: Record<string, DayState>;
  rows: DayRow[];
  summary: ReturnType<typeof summarize>;
  practice: number;
  today: string;
  picked: string | null;
  onPick: (date: string | null) => void;
}) {
  const choices = monthChoices();
  const current = choices.find((c) => c.year === ym.year && c.m0 === ym.m0);
  const pickedRow = picked ? rows.find((r) => r.date === picked) : undefined;

  return (
    <div className="att-cal space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Attendance</h2>
        <Select
          value={current?.value ?? `${ym.year}-${ym.m0}`}
          onValueChange={(v) => {
            const c = choices.find((x) => x.value === v);
            if (c) onMonth({ year: c.year, m0: c.m0 });
          }}
        >
          <SelectTrigger className="h-10 w-[150px] rounded-xl bg-card" aria-label="Month">
            <SelectValue>{current?.label ?? monthLabel(ym.year, ym.m0)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {top}

      <div className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]">
        <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold text-muted-foreground">
          {WEEK_SUN.map((w, i) => (
            <div key={i} className={i === 0 ? "text-rose-500" : undefined}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: sundayLead(ym.year, ym.m0) }).map((_, i) => (
            <div key={`b${i}`} />
          ))}
          {days.map((d) => {
            const st = states[d.date] ?? "none";
            const future = d.date > today;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onPick(picked === d.date ? null : d.date)}
                aria-label={`${dayLabel(d.date)}: ${future ? "not yet" : STATE_WORD[st]}`}
                className={cn(
                  "att-cal-cell",
                  `att-cal-cell--${st}`,
                  future && "att-cal-cell--future",
                  d.date === today && "att-cal-cell--today",
                  picked === d.date && "att-cal-cell--picked",
                )}
              >
                {d.day}
              </button>
            );
          })}
        </div>
        <div className="att-cal-key mt-3">
          <span><i className="k-present" />Present</span>
          <span><i className="k-late" />Late</span>
          <span><i className="k-absent" />Absent</span>
          <span><i className="k-none" />No practice</span>
        </div>
      </div>

      {picked ? (
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="text-sm font-semibold">
            {new Date(picked + "T00:00:00").toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
            <span className="ml-2 font-normal text-muted-foreground">
              {picked > today ? "Not yet" : STATE_WORD[states[picked] ?? "none"]}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <TimeBox label="In" value={time(pickedRow?.inAt ?? null)} />
            <TimeBox label="Out" value={pickedRow?.open ? "Still in" : time(pickedRow?.outAt ?? null)} />
            <TimeBox label="Practice" value={pickedRow?.minutes ? formatDuration(pickedRow.minutes) : null} />
          </div>
        </div>
      ) : null}

      <div className="att-cal-sum">
        <div><span className="n text-emerald-600">{summary.present}</span><span className="l">Present</span></div>
        <div><span className="n text-amber-600">{summary.late}</span><span className="l">Late</span></div>
        <div><span className="n text-rose-600">{summary.absent}</span><span className="l">Absent</span></div>
        <div>
          <span className="n">{summary.pct == null ? "—" : `${summary.pct}%`}</span>
          <span className="l">Attendance</span>
        </div>
        <div><span className="n">{formatDuration(practice)}</span><span className="l">Practice</span></div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="att-cal-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>In</th>
              <th>Out</th>
              <th>Remark</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted py-6 text-center">No practice days yet this month.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.date} onClick={() => onPick(picked === r.date ? null : r.date)} className="cursor-pointer">
                  <td className="num">{dayLabel(r.date)}</td>
                  <td className={cn("num", !r.inAt && "muted")}>{time(r.inAt) ?? "—"}</td>
                  <td className={cn("num", !r.outAt && "muted")}>{r.open ? "Still in" : (time(r.outAt) ?? "—")}</td>
                  <td>
                    <span className={cn("att-chip", `att-chip--${r.state}`)}>{STATE_WORD[r.state]}</span>
                  </td>
                  <td className={cn("num", !r.minutes && "muted")}>{r.minutes ? formatDuration(r.minutes) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimeBox({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold tabular-nums">{value ?? "—"}</div>
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
  top,
}: {
  tenantId: string;
  studentId: string;
  /** Leave out to look it up from the player's own record. */
  batchId?: string | null;
  /** Shown between the title and the calendar. */
  top?: ReactNode;
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

  const view = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const v of q.data?.visits ?? []) {
      const arr = map.get(v.session_date) ?? [];
      arr.push(v);
      map.set(v.session_date, arr);
    }
    const states = playerStates(days, map, q.data?.sessions ?? new Set());
    return {
      states,
      rows: dayRows(days, states, map, today),
      summary: summarize(states, today),
      practice: practiceMinutes(q.data?.visits ?? []),
    };
  }, [q.data, days, today]);

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <AttendanceMonthView
      top={top}
      ym={ym}
      onMonth={(n) => {
        setYm(n);
        setPicked(null);
      }}
      days={days}
      states={view.states}
      rows={view.rows}
      summary={view.summary}
      practice={view.practice}
      today={today}
      picked={picked}
      onPick={setPicked}
    />
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
