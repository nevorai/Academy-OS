import type { Visit } from "./calendar";

/** Minutes after midnight, India time, of a timestamp. */
export function istMinutes(iso: string): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** "5:02 pm" from minutes after midnight. */
export function clockLabel(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "am" : "pm"}`;
}

export const timeOf = (iso: string | null | undefined) => (iso ? clockLabel(istMinutes(iso)) : "–");

const isHere = (v: Visit) => (v.status === "present" || v.status === "late") && !!v.check_in_at;

/** Dates (up to `today`) on which at least one player came: the days the academy really ran. */
export function heldDates(visits: Visit[], today: string): string[] {
  const s = new Set<string>();
  for (const v of visits) if (isHere(v) && v.session_date <= today) s.add(v.session_date);
  return [...s].sort();
}

/** How many different players came on each date (same order as `dates`). */
export function dailyCounts(visits: Visit[], dates: string[]): number[] {
  const per = new Map<string, Set<string>>();
  for (const v of visits) {
    if (!isHere(v)) continue;
    const set = per.get(v.session_date) ?? new Set<string>();
    set.add(v.student_id);
    per.set(v.session_date, set);
  }
  return dates.map((d) => per.get(d)?.size ?? 0);
}

export interface PlayerStat {
  studentId: string;
  /** Different days the player came. */
  days: number;
  lastSeen: string | null;
  /** Average arrival, minutes after midnight (India time), or null with no arrivals. */
  avgArrival: number | null;
  /** Total practice minutes (only visits that were closed). */
  minutes: number;
}

export function playerStats(visits: Visit[]): Map<string, PlayerStat> {
  const dates = new Map<string, Set<string>>();
  const firstIn = new Map<string, Map<string, number>>(); // student -> date -> earliest arrival
  const minutes = new Map<string, number>();
  for (const v of visits) {
    if (!isHere(v)) continue;
    const d = dates.get(v.student_id) ?? new Set<string>();
    d.add(v.session_date);
    dates.set(v.student_id, d);
    const arr = istMinutes(v.check_in_at!);
    const f = firstIn.get(v.student_id) ?? new Map<string, number>();
    const prev = f.get(v.session_date);
    if (prev === undefined || arr < prev) f.set(v.session_date, arr);
    firstIn.set(v.student_id, f);
    minutes.set(v.student_id, (minutes.get(v.student_id) ?? 0) + (v.duration_minutes ?? 0));
  }
  const out = new Map<string, PlayerStat>();
  for (const [id, d] of dates) {
    const arrivals = [...(firstIn.get(id)?.values() ?? [])];
    out.set(id, {
      studentId: id,
      days: d.size,
      lastSeen: [...d].sort().slice(-1)[0] ?? null,
      avgArrival: arrivals.length
        ? Math.round(arrivals.reduce((a, b) => a + b, 0) / arrivals.length)
        : null,
      minutes: minutes.get(id) ?? 0,
    });
  }
  return out;
}

/** Whole percent of the academy's practice days the player came; null when no day has run yet. */
export function pctOf(days: number, held: number): number | null {
  return held ? Math.min(100, Math.round((days / held) * 100)) : null;
}
