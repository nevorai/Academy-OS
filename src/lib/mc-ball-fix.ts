/**
 * "Fix an earlier ball": pure helpers.
 *
 * The scorer goes back to a ball by undoing everything after it, enters the
 * right result with the normal buttons, then re-applies the later balls one by
 * one through the normal scoring path. These helpers decide, for each held
 * ball, who must be at the crease and which bowler bowls it, so strike and
 * wickets stay right when the fixed ball changed who is on strike.
 */
import { ballChipLabel } from "@/lib/mc-commentary";
import { applyStrikeAfterBall } from "@/lib/mc-rules-engine";
import { countsAsBall, type DismissalType, type ExtraType, type MCBallEvent } from "@/lib/mc-ball-events";

export interface PlayerRef {
  athleteId: string | null;
  name: string | null;
}

export interface LivePair {
  striker: PlayerRef;
  nonStriker: PlayerRef;
}

export interface HeldBallInput {
  runsOffBat: number;
  extraType: ExtraType | null;
  extraRuns: number;
  dismissalType: DismissalType | null;
  dismissedAthleteId: string | null;
  dismissedName: string | null;
  fielderAthleteId: string | null;
  fielderName: string | null;
  comment: string | null;
}

export type ReapplyPlan =
  | { ok: true; striker: PlayerRef; nonStriker: PlayerRef; input: HeldBallInput }
  | { ok: false; error: string };

/** Dismissals that can only happen to the batter facing the ball. */
const STRIKER_ONLY: readonly string[] = [
  "bowled",
  "lbw",
  "caught",
  "stumped",
  "hit_wicket",
  "hit_ball_twice",
  "handled_ball",
];

export function samePlayer(a: PlayerRef, b: PlayerRef): boolean {
  if (a.athleteId && b.athleteId) return a.athleteId === b.athleteId;
  return Boolean(a.name && b.name && a.name === b.name);
}

export function isEmptyPlayer(p: PlayerRef): boolean {
  return !p.athleteId && !p.name;
}

function shown(p: PlayerRef): string {
  return p.name ?? "a batter";
}

/**
 * Who stood where after `prev` was first scored, worked out by the scoring
 * rules alone (odd runs and the end of an over swap strike, a wicket empties a
 * slot). Manual "swap strike" taps are not part of this, which is the point:
 * comparing it with the live pair shows what the fix changed.
 */
export function expectedPairAfter(prev: MCBallEvent): LivePair {
  const overDone = countsAsBall(prev) && prev.ball_number >= 6;
  const rotated = applyStrikeAfterBall(
    {
      striker: { athleteId: prev.striker_athlete_id, name: prev.striker_name },
      nonStriker: { athleteId: prev.non_striker_athlete_id, name: prev.non_striker_name },
    },
    prev,
    overDone,
  );
  let striker: PlayerRef = { athleteId: rotated.striker.athleteId, name: rotated.striker.name };
  let nonStriker: PlayerRef = { athleteId: rotated.nonStriker.athleteId, name: rotated.nonStriker.name };
  if (prev.dismissal_type && (prev.dismissed_athlete_id || prev.dismissed_name)) {
    const out: PlayerRef = { athleteId: prev.dismissed_athlete_id, name: prev.dismissed_name };
    if (samePlayer(striker, out)) striker = { athleteId: null, name: null };
    else if (samePlayer(nonStriker, out)) nonStriker = { athleteId: null, name: null };
  }
  return { striker, nonStriker };
}

/**
 * Decide who is at the crease for a held ball and what to record.
 *
 * The held ball remembers who faced and who was at the other end, including any
 * manual strike swap the scorer made. The fix may have moved strike (odd runs
 * became even, or the other way round): `expected` is where the original
 * innings had the batters at this point, so the difference to the live pair
 * is exactly what the fix changed, and that shift is carried to this ball.
 * A wicket that needs the facing batter is refused when the shift moved it.
 */
export function planHeldBall(
  held: MCBallEvent,
  live: LivePair,
  expected: LivePair | null = null,
): ReapplyPlan {
  const origStriker: PlayerRef = { athleteId: held.striker_athlete_id, name: held.striker_name };
  const origNon: PlayerRef = { athleteId: held.non_striker_athlete_id, name: held.non_striker_name };

  const strikerEmpty = isEmptyPlayer(live.striker);
  const nonEmpty = isEmptyPlayer(live.nonStriker);

  if (strikerEmpty && nonEmpty) {
    return { ok: false, error: "No batters are at the crease for the next ball." };
  }

  let striker = origStriker;
  let nonStriker = origNon;

  if (strikerEmpty || nonEmpty) {
    // A wicket fell on the previous ball: the batter still at the crease must be
    // one of this ball's batters. Roles come from the record (the scorer's pick).
    const survivor = strikerEmpty ? live.nonStriker : live.striker;
    if (!samePlayer(survivor, origStriker) && !samePlayer(survivor, origNon)) {
      return {
        ok: false,
        error: `Later balls were played by ${shown(origStriker)} and ${shown(origNon)}, but ${shown(survivor)} is at the crease now.`,
      };
    }
  } else {
    const straight = samePlayer(origStriker, live.striker) && samePlayer(origNon, live.nonStriker);
    const crossed = samePlayer(origStriker, live.nonStriker) && samePlayer(origNon, live.striker);
    if (!straight && !crossed) {
      return {
        ok: false,
        error: `Later balls were played by ${shown(origStriker)} and ${shown(origNon)}, but ${shown(live.striker)} and ${shown(live.nonStriker)} are at the crease now.`,
      };
    }
    let flip = crossed;
    if (expected && !isEmptyPlayer(expected.striker) && !isEmptyPlayer(expected.nonStriker)) {
      const expStraight =
        samePlayer(expected.striker, live.striker) && samePlayer(expected.nonStriker, live.nonStriker);
      const expCrossed =
        samePlayer(expected.striker, live.nonStriker) && samePlayer(expected.nonStriker, live.striker);
      if (expStraight || expCrossed) flip = expCrossed && !expStraight;
    }
    if (flip) {
      striker = origNon;
      nonStriker = origStriker;
    }
  }

  // A dismissal that can only fall on the batter facing the ball (bowled, caught...)
  // must not move to the other batter just because the fix moved strike: the
  // scorer decides that by hand. A run out names its batter, so it stays as it was.
  const dismissed: PlayerRef = {
    athleteId: held.dismissed_athlete_id,
    name: held.dismissed_name,
  };
  if (
    held.dismissal_type &&
    STRIKER_ONLY.includes(held.dismissal_type) &&
    !isEmptyPlayer(dismissed) &&
    samePlayer(dismissed, origStriker) &&
    !samePlayer(dismissed, striker)
  ) {
    return {
      ok: false,
      error: `Strike moved because of the fix, so ${shown(dismissed)}, who was out on this ball, is no longer facing. Score this ball by hand.`,
    };
  }

  return {
    ok: true,
    striker,
    nonStriker,
    input: {
      runsOffBat: held.runs_off_bat ?? 0,
      extraType: (held.extra_type ?? null) as ExtraType | null,
      extraRuns: held.extra_runs ?? 0,
      dismissalType: (held.dismissal_type ?? null) as DismissalType | null,
      dismissedAthleteId: held.dismissed_athlete_id ?? null,
      dismissedName: held.dismissed_name ?? null,
      fielderAthleteId: held.fielder_athlete_id ?? null,
      fielderName: held.fielder_name ?? null,
      comment: held.comment ?? null,
    },
  };
}

/** Legal balls already bowled in the over that the next ball will join (0 = next ball opens a new over). */
export function legalBallsInOpenOver(events: MCBallEvent[]): number {
  if (events.length === 0) return 0;
  const last = events[events.length - 1];
  const legal = events.filter((e) => e.over_number === last.over_number && countsAsBall(e)).length;
  return legal >= 6 ? 0 : legal;
}

/**
 * Who bowls a held ball. A new over uses the bowler it was first bowled by.
 * In the middle of an over the bowler stays as it is (a bowler is not swapped
 * mid over just because the fix added or removed a delivery).
 */
export function bowlerForHeld(
  held: MCBallEvent,
  liveBowler: PlayerRef,
  eventsSoFar: MCBallEvent[],
): PlayerRef {
  const original: PlayerRef = { athleteId: held.bowler_athlete_id, name: held.bowler_name };
  if (isEmptyPlayer(liveBowler)) return original;
  if (legalBallsInOpenOver(eventsSoFar) === 0) return original;
  return liveBowler;
}

/* ---------------- put held balls back through the normal scoring path ---------------- */

export interface ReapplyIO {
  getLive: () => { striker: PlayerRef; nonStriker: PlayerRef; bowler: PlayerRef };
  setStriker: (b: PlayerRef & { onStrike: boolean }) => void;
  setNonStriker: (b: PlayerRef & { onStrike: boolean }) => void;
  setBowler: (b: PlayerRef) => void;
  submitBall: (input: HeldBallInput) => Promise<MCBallEvent>;
}

export interface ReapplyResult {
  /** Balls that were not applied (empty when everything went back). */
  left: MCBallEvent[];
  error: string | null;
}

function overBallText(e: MCBallEvent): string {
  return `over ${e.over_number + 1}, ball ${e.ball_number}`;
}

/**
 * Re-apply `list` in order. Stops at the first ball that cannot go back (the
 * batters do not match, or the scoring rules refuse it) and reports why.
 * `baseline` is the innings as it stands before the first ball goes in.
 * `prevOriginal` is the ball that came right before `list[0]` in the original
 * innings (null when `list[0]` is itself the first ball of the stretch).
 */
export async function reapplyBalls(
  io: ReapplyIO,
  list: MCBallEvent[],
  baseline: MCBallEvent[],
  afterEach: (left: MCBallEvent[]) => void,
  prevOriginal: MCBallEvent | null = null,
): Promise<ReapplyResult> {
  let left = [...list];
  const applied = [...baseline];
  let prev = prevOriginal;
  while (left.length > 0) {
    const next = left[0];
    const live = io.getLive();
    const plan = planHeldBall(next, live, prev ? expectedPairAfter(prev) : null);
    if (!plan.ok) {
      return { left, error: `Stopped at ${overBallText(next)}. ${plan.error}` };
    }
    io.setStriker({ ...plan.striker, onStrike: true });
    io.setNonStriker({ ...plan.nonStriker, onStrike: false });
    const bowler = bowlerForHeld(next, live.bowler, applied);
    if (bowler.athleteId !== live.bowler.athleteId || bowler.name !== live.bowler.name) {
      io.setBowler(bowler);
    }
    try {
      applied.push(await io.submitBall(plan.input));
    } catch (e) {
      const why = e instanceof Error ? e.message : "could not save the ball";
      return { left, error: `Stopped at ${overBallText(next)}: ${why}` };
    }
    prev = next;
    left = left.slice(1);
    afterEach(left);
  }
  return { left, error: null };
}

/* ---------------- list shown to the scorer ---------------- */

export interface FixableBall {
  id: string;
  overLabel: string;
  chip: string;
  who: string;
  isExtra: boolean;
}

/** Newest first. `overs` are shown the way scorers say them: the first over is over 1. */
export function fixableBalls(events: MCBallEvent[]): FixableBall[] {
  return [...events]
    .sort((a, b) => b.sequence_number - a.sequence_number)
    .map((e) => {
      const legal = countsAsBall(e);
      const bowler = e.bowler_name ?? "Bowler";
      const striker = e.striker_name ?? "Batter";
      return {
        id: e.id,
        overLabel: legal
          ? `Over ${e.over_number + 1} · ball ${e.ball_number}`
          : `Over ${e.over_number + 1} · extra`,
        chip: ballChipLabel(e),
        who: `${bowler} to ${striker}`,
        isExtra: !legal,
      };
    });
}

/* ---------------- survive a closed tab ---------------- */

export interface SavedFix {
  inningsId: string;
  original: MCBallEvent;
  /** Every ball that came after the fixed one, oldest first. */
  held: MCBallEvent[];
  /** How many of `held` are already back on the scorecard. */
  done: number;
  baseLen: number;
}

const KEY_PREFIX = "academy:ball-fix:";

export function loadSavedFix(inningsId: string): SavedFix | null {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + inningsId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedFix;
    if (parsed?.inningsId !== inningsId || !parsed.original || !Array.isArray(parsed.held)) return null;
    return { ...parsed, done: Number.isFinite(parsed.done) ? parsed.done : 0 };
  } catch {
    return null;
  }
}

export function saveFix(fix: SavedFix): void {
  try {
    window.localStorage.setItem(KEY_PREFIX + fix.inningsId, JSON.stringify(fix));
  } catch {
    // storage blocked: the fix still works for this visit
  }
}

export function clearSavedFix(inningsId: string): void {
  try {
    window.localStorage.removeItem(KEY_PREFIX + inningsId);
  } catch {
    // nothing to clear
  }
}
