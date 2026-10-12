/**
 * Pure helpers for the player detail page: dates, tenure and the merged timeline.
 * Nothing here talks to the database, so every rule can be tested on its own.
 */
import {
  addDays,
  differenceInCalendarDays,
  differenceInYears,
  format,
  parseISO,
  startOfDay,
} from "date-fns";
import type { MonthDay } from "@/lib/attendance/calendar";
import { formatDuration } from "@/lib/attendance/constants";

/** Parses a plain date or a full timestamp as a local calendar day. */
export function parseDay(value: string): Date {
  return parseISO(value.length > 10 ? value.slice(0, 10) : value);
}

export function ageInYears(dob: string | null, now = new Date()): number | null {
  if (!dob) return null;
  const born = parseDay(dob);
  return Number.isNaN(born.getTime()) ? null : differenceInYears(now, born);
}

/** The next birthday on or after today. A birthday that is today counts as today (0 days). */
export function nextBirthday(
  dob: string | null,
  now = new Date(),
): { date: Date; days: number } | null {
  if (!dob) return null;
  const born = parseDay(dob);
  if (Number.isNaN(born.getTime())) return null;
  const today = startOfDay(now);
  let next = new Date(today.getFullYear(), born.getMonth(), born.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, born.getMonth(), born.getDate());
  return { date: next, days: differenceInCalendarDays(next, today) };
}

/** "New", "5 mo" or "2y": how long the player has been with the academy. */
export function tenure(joinedAt: string | null, now = new Date()): string {
  if (!joinedAt) return "—";
  const joined = parseDay(joinedAt);
  if (Number.isNaN(joined.getTime()) || joined > now) return "—";
  const years = differenceInYears(now, joined);
  if (years >= 1) return `${years}y`;
  const months =
    (now.getFullYear() - joined.getFullYear()) * 12 + now.getMonth() - joined.getMonth();
  const whole = now.getDate() < joined.getDate() ? months - 1 : months;
  return whole < 1 ? "New" : `${whole} mo`;
}

/**
 * The last `count` days up to and including `today` (YYYY-MM-DD), never earlier than the day the
 * player joined, so days before joining are not counted as missed.
 */
export function lastDays(today: string, count: number, joinedAt?: string | null): MonthDay[] {
  const end = parseDay(today);
  let start = addDays(end, -(count - 1));
  if (joinedAt) {
    const joined = parseDay(joinedAt);
    if (!Number.isNaN(joined.getTime()) && joined > start) start = joined;
  }
  const out: MonthDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push({ date: format(d, "yyyy-MM-dd"), day: d.getDate(), weekday: (d.getDay() + 6) % 7 });
  }
  return out;
}

/* ------------------------------- timeline ------------------------------- */

export type TimelineIcon = "in" | "out" | "note" | "match" | "award" | "payment";
export type TimelineTone = "brand" | "success" | "info" | "muted";

export interface TimelineItem {
  id: string;
  at: string;
  title: string;
  meta?: string;
  icon: TimelineIcon;
  tone: TimelineTone;
}

export interface TimelineInput {
  visits: {
    mark_id: string;
    check_in_at: string | null;
    check_out_at: string | null;
    duration_minutes: number | null;
    visit_type: string | null;
    note: string | null;
  }[];
  remarks: { id: string; created_at: string; remark: string; author_name: string | null }[];
  matches: {
    id: string;
    is_captain: boolean | null;
    is_keeper: boolean | null;
    role: string | null;
    is_player_of_match: boolean;
    match: {
      scheduled_date: string | null;
      ground_name: string | null;
      result: string | null;
    } | null;
  }[];
  payments: { id: string; amount: number; period: string | null; created_at: string }[];
  query?: string;
}

/** Everything that happened to a player, newest first, optionally filtered by a search word. */
export function buildTimeline(input: TimelineInput): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const v of input.visits) {
    if (v.check_in_at) {
      out.push({
        id: `in-${v.mark_id}`,
        at: v.check_in_at,
        title: v.visit_type ? `Checked in · ${v.visit_type}` : "Checked in",
        meta: v.note ?? undefined,
        icon: "in",
        tone: "success",
      });
    }
    if (v.check_out_at) {
      out.push({
        id: `out-${v.mark_id}`,
        at: v.check_out_at,
        title: "Checked out",
        meta: v.duration_minutes ? formatDuration(v.duration_minutes) : undefined,
        icon: "out",
        tone: "info",
      });
    }
  }
  for (const r of input.remarks) {
    out.push({
      id: `note-${r.id}`,
      at: r.created_at,
      title: r.remark,
      meta: r.author_name ?? "Coach",
      icon: "note",
      tone: "brand",
    });
  }
  for (const m of input.matches) {
    if (!m.match?.scheduled_date) continue;
    const bits: string[] = [];
    if (m.is_captain) bits.push("Captain");
    if (m.is_keeper) bits.push("Keeper");
    if (m.role) bits.push(m.role);
    if (m.is_player_of_match) bits.push("Player of Match");
    out.push({
      id: `match-${m.id}`,
      at: m.match.scheduled_date,
      title: m.match.ground_name ?? "Match",
      meta: bits.length ? bits.join(" · ") : (m.match.result ?? undefined),
      icon: m.is_player_of_match ? "award" : "match",
      tone: m.is_player_of_match ? "brand" : "muted",
    });
  }
  for (const p of input.payments) {
    out.push({
      id: `pay-${p.id}`,
      at: p.created_at,
      title: p.period ? `Fee paid · ${p.period}` : "Fee paid",
      meta: `₹${Number(p.amount).toLocaleString("en-IN")}`,
      icon: "payment",
      tone: "muted",
    });
  }
  // Compare real moments, not text: a plain match date and a timestamp with a time zone differ in shape.
  out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const needle = (input.query ?? "").trim().toLowerCase();
  if (!needle) return out;
  return out.filter(
    (i) => i.title.toLowerCase().includes(needle) || (i.meta ?? "").toLowerCase().includes(needle),
  );
}

/** Who a coach note is written by: the signed-in person's name, else their role. */
export function noteAuthor(
  meta: Record<string, unknown> | null | undefined,
  role: string | null,
): string {
  for (const key of ["full_name", "name"]) {
    const v = meta?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return role === "owner" ? "Owner" : "Coach";
}
