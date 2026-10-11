/**
 * Attendance roster helpers: which batches belong to a session, who is late,
 * and the shapes the roster screen passes around. Pure functions, no data
 * access, so they are easy to test.
 */

import type { AttendanceState } from "@/lib/attendance/constants";

export type SessionFilter = "all" | "morning" | "evening" | "night";
export type SessionBucket = "morning" | "evening" | "night";
export type RosterTab = "waiting" | "present" | "done";

export interface StudentLite {
  id: string;
  name: string;
  photo_url: string | null;
  player_id: string | null;
  batch_id: string | null;
}

export interface TodayRow {
  mark_id: string;
  batch_id: string;
  current_state: AttendanceState;
  check_in_at: string | null;
  check_out_at: string | null;
  duration_minutes: number | null;
  visit_count?: number;
  auto_checked_out?: boolean;
}

/**
 * Parse a free-text batch `timing` into the set of session buckets it belongs
 * to. Handles both keyword-tagged timings ("Morning batch", "Both", "Personal
 * coaching") and pure clock ranges ("6:00 AM – 10:00 AM", "4:00 PM – 8:00 PM",
 * "9 PM – 11 PM"). A batch may belong to multiple buckets, e.g. an explicit
 * "Both" tag or a range that spans morning and evening.
 *
 * Time-based rules (24h start hour):
 *   4  ≤ h < 12  → morning
 *   12 ≤ h < 20  → evening (afternoon rolls into evening)
 *   otherwise    → night
 */
export function batchSessionBuckets(timing: string | null | undefined): Set<SessionBucket> {
  const buckets = new Set<SessionBucket>();
  const t = (timing ?? "").toLowerCase();

  // 1) Explicit keyword tags.
  const kwMorning = /morn/.test(t);
  const kwEvening = /even/.test(t);
  const kwNight = /night/.test(t);
  const kwBoth = /both/.test(t);
  const kwPersonal = /personal|coaching/.test(t);

  if (kwMorning || kwBoth) buckets.add("morning");
  if (kwEvening || kwBoth) buckets.add("evening");
  if (kwNight || kwPersonal) buckets.add("night");

  // 2) Time-of-day fallback / augmentation from the first & last clock times.
  const times = Array.from(t.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi)).map((m) => {
    let h = parseInt(m[1]!, 10);
    const mer = m[3]!.toLowerCase();
    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return h;
  });
  if (times.length > 0) {
    const start = times[0]!;
    const end = times[times.length - 1] ?? start;
    const hourToBucket = (h: number): SessionBucket => {
      if (h >= 4 && h < 12) return "morning";
      if (h >= 12 && h < 20) return "evening";
      return "night";
    };
    buckets.add(hourToBucket(start));
    if (end !== start) buckets.add(hourToBucket(end));
  }

  // 3) If nothing matched (no keyword, no parseable time), don't hide the
  //    batch: assign it to morning so it still appears somewhere.
  if (buckets.size === 0) buckets.add("morning");

  return buckets;
}

export function batchMatchesSession(
  timing: string | null | undefined,
  session: SessionFilter,
): boolean {
  if (session === "all") return true;
  return batchSessionBuckets(timing).has(session);
}

export function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/**
 * Best-effort late threshold. Parses the first `h[:mm] am/pm` clock time from
 * the free-text `timing` field on the batch. If a batch says "6:00 AM – 8:00 AM"
 * we treat 6:00 AM as the start; anything ≥ 10 min after that on the same date
 * counts as "Late". No schema change, pure derivation. Returns null when we
 * can't parse a start time (in which case we simply don't show the badge).
 */
export function parseBatchStartMs(
  timing: string | null | undefined,
  dayISO: string,
): number | null {
  if (!timing) return null;
  const m = timing.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let h = parseInt(m[1]!, 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3]!.toLowerCase();
  if (mer === "pm" && h !== 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  const [y, mo, d] = dayISO.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y!, (mo ?? 1) - 1, d ?? 1, h, min, 0, 0);
  return dt.getTime();
}

export const LATE_GRACE_MS = 10 * 60 * 1000;
