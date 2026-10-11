/* ================================================================
 * Ball Event Core — pure primitives with NO runtime dependencies.
 * ----------------------------------------------------------------
 * This module is safe to import from anywhere (engines, tests,
 * simulations) without pulling in Supabase or database types.
 * The full ball-events module (src/lib/mc-ball-events.ts) re-exports
 * these so existing imports keep working.
 * ================================================================ */

export type ExtraType = "wide" | "no_ball" | "bye" | "leg_bye" | "penalty";

export type DismissalType =
  | "bowled"
  | "caught"
  | "lbw"
  | "run_out"
  | "stumped"
  | "hit_wicket"
  | "retired_hurt"
  | "retired_out"
  | "timed_out"
  | "obstructing_field"
  | "handled_ball"
  | "hit_ball_twice";

/** Legal-extras count against the over's 6-ball budget. */
export const LEGAL_EXTRAS: readonly ExtraType[] = ["bye", "leg_bye"];
export const ILLEGAL_EXTRAS: readonly ExtraType[] = ["wide", "no_ball"];
/** Penalty runs are awarded to the batting side but nobody bowls a ball. */
export const NON_DELIVERY_EXTRAS: readonly ExtraType[] = ["penalty"];
/** These end a batter's innings between balls: no delivery is bowled. */
export const NON_DELIVERY_DISMISSALS: readonly DismissalType[] = [
  "retired_hurt",
  "retired_out",
  "timed_out",
];

export function isLegalDelivery(extra: ExtraType | null | undefined): boolean {
  if (!extra) return true;
  return (LEGAL_EXTRAS as readonly string[]).includes(extra);
}

/**
 * Does this event use up one of the over's six balls?
 * Wides, no-balls and penalty runs do not. Neither does a batter retiring or
 * being timed out: those happen between balls, so they are not a dot ball.
 * Every ball counter in the app goes through this one function.
 */
export function countsAsBall(e: {
  extra_type?: string | null;
  dismissal_type?: string | null;
}): boolean {
  const extra = (e.extra_type ?? null) as ExtraType | null;
  if (!extra && e.dismissal_type) {
    if ((NON_DELIVERY_DISMISSALS as readonly string[]).includes(e.dismissal_type)) return false;
  }
  return isLegalDelivery(extra);
}

/**
 * Standardizes a ball notation label (e.g. "NB4" -> "NB+3", "0" -> "•").
 * Used for consistent rendering across both live scoring and history.
 */
export function formatBallNotation(label: string): string {
  let upper = label.toUpperCase();
  // Standardize notation if it's purely a number and not 0
  if (/^[1-6]$/.test(upper)) {
    // Keep as is
  } else if (upper === "0" || upper === "DOT" || upper === "•") {
    upper = "•";
  } else if (/^WD\d+$/.test(upper)) {
    // Keep as is - numeric part is already total
  } else if (/^NB\d+$/.test(upper)) {
    // Keep as is - numeric part is already total
  } else if (/^B\d+$/.test(upper)) {
    const runs = parseInt(upper.slice(1));
    upper = runs > 0 ? `B ${runs}` : "•";
  } else if (/^LB\d+$/.test(upper)) {
    const runs = parseInt(upper.slice(2));
    upper = runs > 0 ? `LB ${runs}` : "•";
  }
  return upper;
}

export class BallEventError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "BallEventError";
  }
}
