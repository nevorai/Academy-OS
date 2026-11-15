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
/** Saved in the ball comment so a no-ball's byes can be told apart from leg byes. */
export const NO_BALL_LEG_BYES_COMMENT = "Leg byes off the no-ball";
/**
 * Saved in the ball comment of a run out when the batters had crossed, so the
 * batter who is left stands at the right end after undo, redo and a re-open.
 */
export const BATTERS_CROSSED_COMMENT = "Batters crossed";

/** Is this marker in the ball's comment? (A ball can carry more than one.) */
export function hasBallNote(comment: string | null | undefined, marker: string): boolean {
  return Boolean(comment && comment.includes(marker));
}

export function addBallNote(comment: string | null | undefined, marker: string): string {
  if (!comment) return marker;
  return hasBallNote(comment, marker) ? comment : `${comment}; ${marker}`;
}

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

/** Where the next ball goes: over, ball in the over, and running sequence number. */
export interface OverBallPosition {
  overNumber: number; // 0-indexed
  ballNumber: number; // 1-indexed inside the over (legal + illegal share index of next legal ball)
  sequenceNumber: number; // monotonic per innings
}

export function nextPosition(
  events: readonly {
    over_number: number;
    sequence_number: number;
    extra_type?: string | null;
    dismissal_type?: string | null;
  }[],
): OverBallPosition {
  if (events.length === 0) {
    return { overNumber: 0, ballNumber: 1, sequenceNumber: 1 };
  }
  const last = events[events.length - 1];
  const nextSeq = (last.sequence_number ?? events.length) + 1;

  // Count legal deliveries so far in `last.over_number`. Re-derive from
  // extra_type: a stale `is_legal_delivery` flag must never influence the
  // position of the next ball.
  const legalInOver = events.filter(
    (e) => e.over_number === last.over_number && countsAsBall(e),
  ).length;

  if (legalInOver >= 6) {
    return { overNumber: last.over_number + 1, ballNumber: 1, sequenceNumber: nextSeq };
  }
  // Same over: ball number is the legal count so far + 1.
  return { overNumber: last.over_number, ballNumber: legalInOver + 1, sequenceNumber: nextSeq };
}

export class BallEventError extends Error {
  code: string;
  /** True for "no internet / server busy": the same save may be tried again. */
  retryable?: boolean;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "BallEventError";
  }
}
