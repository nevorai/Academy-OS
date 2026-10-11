/**
 * A match left on "live" with no scoring for this long is treated as NOT live on the public pages
 * (banner, "Live Now"). Otherwise one abandoned test or unfinished match shows a red LIVE badge on
 * the academy's public site for weeks.
 */
export const LIVE_IDLE_LIMIT_MS = 12 * 60 * 60 * 1000;

export function isLiveStale(lastActivity: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastActivity) return false;
  const t = Date.parse(lastActivity);
  return Number.isFinite(t) && now - t > LIVE_IDLE_LIMIT_MS;
}

/** Newest `created_at` among ball events, or null when there are none. */
export function lastBallTime(balls: ReadonlyArray<{ created_at?: string | null }> | null | undefined): string | null {
  let best: string | null = null;
  for (const b of balls ?? []) {
    if (b.created_at && (!best || b.created_at > best)) best = b.created_at;
  }
  return best;
}
