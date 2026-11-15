/* ================================================================
 * Scoring core: what happens when the scorer saves, undoes, redoes
 * or re-opens a match. Pure functions, no React and no database.
 * ----------------------------------------------------------------
 * The live scorer hook, the demo scorer hook, the scorer screen and
 * the whole-match test (mc-full-match.test.ts) all call THIS file, so
 * a rule is written once and the test plays the same code the phone
 * runs.
 * ================================================================ */

import type { DismissalType, ExtraType, MCBallEvent, MCInnings } from "@/lib/mc-ball-events";
import {
  BATTERS_CROSSED_COMMENT,
  BallEventError,
  NO_BALL_LEG_BYES_COMMENT,
  addBallNote,
  hasBallNote,
  countsAsBall,
  nextPosition,
} from "@/lib/mc-ball-events-core";
import {
  applyStrikeAfterBall,
  isDeliveryEvent,
  replayInnings,
  validateBallDraft,
  type MatchState,
} from "@/lib/mc-rules-engine";

/* ---------------- who is at the crease ---------------- */

export interface SeatRef {
  athleteId: string | null;
  name: string | null;
}
export interface BatterSeat extends SeatRef {
  onStrike: boolean;
}
export interface Lineup {
  striker: BatterSeat;
  nonStriker: BatterSeat;
  bowler: SeatRef;
}

export const EMPTY_STRIKER: BatterSeat = { athleteId: null, name: null, onStrike: true };
export const EMPTY_NON_STRIKER: BatterSeat = { athleteId: null, name: null, onStrike: false };
export const EMPTY_BOWLER: SeatRef = { athleteId: null, name: null };

export function emptyLineup(): Lineup {
  return {
    striker: { ...EMPTY_STRIKER },
    nonStriker: { ...EMPTY_NON_STRIKER },
    bowler: { ...EMPTY_BOWLER },
  };
}

export function isEmptySeat(p: { athleteId?: string | null; name?: string | null }): boolean {
  return !p.athleteId && !p.name;
}

export function samePlayerRef(
  a: { athleteId?: string | null; name?: string | null },
  b: { athleteId?: string | null; name?: string | null },
): boolean {
  return (
    Boolean(a.athleteId && b.athleteId && a.athleteId === b.athleteId) ||
    Boolean(!a.athleteId && !b.athleteId && a.name && b.name && a.name === b.name)
  );
}

/** The batter who got out (or retired) on this ball leaves an empty seat. */
export function clearDismissedBatter(
  pair: { striker: BatterSeat; nonStriker: BatterSeat },
  event: MCBallEvent,
): { striker: BatterSeat; nonStriker: BatterSeat } {
  const dismissed = { athleteId: event.dismissed_athlete_id, name: event.dismissed_name };
  if (!dismissed.athleteId && !dismissed.name) return pair;
  if (samePlayerRef(pair.striker, dismissed)) return { ...pair, striker: { ...EMPTY_STRIKER } };
  if (samePlayerRef(pair.nonStriker, dismissed))
    return { ...pair, nonStriker: { ...EMPTY_NON_STRIKER } };
  return pair;
}

/**
 * After a wicket the replay says "waiting for a new batter". Once the scorer
 * has picked two batters who are not out, that wait is over.
 */
export function matchStateForSelectedBatters(
  state: MatchState,
  striker: SeatRef,
  nonStriker: SeatRef,
): MatchState {
  if (!state.innings.awaitingNewBatter) return state;
  const ready = (p: SeatRef) =>
    Boolean(p.athleteId || p.name) &&
    !(p.athleteId && state.innings.dismissedIds.has(p.athleteId)) &&
    !(p.name && state.innings.dismissedNames.has(p.name));
  if (!ready(striker) || !ready(nonStriker) || samePlayerRef(striker, nonStriker)) return state;
  return { ...state, innings: { ...state.innings, awaitingNewBatter: false } };
}

/* ---------------- saving one ball ---------------- */

export interface BallInput {
  runsOffBat?: number;
  extraType?: ExtraType | null;
  extraRuns?: number;
  dismissalType?: DismissalType | null;
  dismissedAthleteId?: string | null;
  dismissedName?: string | null;
  fielderAthleteId?: string | null;
  fielderName?: string | null;
  comment?: string | null;
}

/** Did this ball complete the over (6th legal ball)? */
export function ballCompletesOver(event: MCBallEvent, priorEvents: MCBallEvent[]): boolean {
  if (!countsAsBall(event)) return false;
  const legalBefore = priorEvents.filter(
    (e) => e.over_number === event.over_number && countsAsBall(e),
  ).length;
  return legalBefore + 1 >= 6;
}

/**
 * Who bats where after this ball: odd runs swap, the end of the over swaps,
 * and a batter who is out leaves an empty seat.
 */
export function battersAfterBall(
  pre: { striker: SeatRef; nonStriker: SeatRef },
  event: MCBallEvent,
  priorEvents: MCBallEvent[],
): { striker: BatterSeat; nonStriker: BatterSeat; overCompleted: boolean } {
  const overCompleted = ballCompletesOver(event, priorEvents);
  const rotated = applyStrikeAfterBall(
    {
      striker: { athleteId: pre.striker.athleteId, name: pre.striker.name },
      nonStriker: { athleteId: pre.nonStriker.athleteId, name: pre.nonStriker.name },
    },
    event,
    overCompleted,
  );
  const seated = {
    striker: { athleteId: rotated.striker.athleteId, name: rotated.striker.name, onStrike: true },
    nonStriker: {
      athleteId: rotated.nonStriker.athleteId,
      name: rotated.nonStriker.name,
      onStrike: false,
    },
  };
  let next = event.dismissal_type ? clearDismissedBatter(seated, event) : seated;
  // Run out after the batters crossed: the batter who is left has changed ends,
  // so the EMPTY seat (where the new batter goes) is the other one.
  if (event.dismissal_type === "run_out" && hasBallNote(event.comment, BATTERS_CROSSED_COMMENT)) {
    next = {
      striker: { ...next.nonStriker, onStrike: true },
      nonStriker: { ...next.striker, onStrike: false },
    };
  }
  return { ...next, overCompleted };
}

export interface PrepareBallArgs {
  /** Every ball of the innings so far, oldest first. */
  events: MCBallEvent[];
  lineup: Lineup;
  input: BallInput;
  innings: MCInnings | null;
  matchStatus?: string | null;
  /** Overs in the innings (null = no limit). */
  totalOvers: number | null;
  /** Wickets that bowl the side out. */
  maxWickets: number;
  /** A fifth of the overs per bowler. Off for the demo scorer. */
  enforceBowlerQuota?: boolean;
  /** Refuse a ball once the match is decided. Off for the demo scorer. */
  blockWhenMatchOver?: boolean;
  ids: { eventId: string; tenantId: string; matchId: string; createdBy: string | null };
}

export interface PreparedBall {
  event: MCBallEvent;
  striker: BatterSeat;
  nonStriker: BatterSeat;
  overCompleted: boolean;
}

/**
 * Check a ball against the rules and build the row to save plus the batters
 * for the next ball. Throws BallEventError when the ball is not allowed.
 */
export function prepareBall(a: PrepareBallArgs): PreparedBall {
  if (!a.innings) throw new BallEventError("INVALID_INNINGS", "Start an innings before scoring.");
  if (a.innings.status !== "in_progress")
    throw new BallEventError("INNINGS_CLOSED", "Innings is not in progress.");
  if (a.matchStatus === "completed" || a.matchStatus === "archived")
    throw new BallEventError("MATCH_COMPLETED", "Match is no longer active.");

  const state = replayInnings(a.events, {
    totalOvers: a.totalOvers,
    maxWickets: a.maxWickets,
    target: a.innings.target ?? null,
  });
  if (a.blockWhenMatchOver !== false && state.matchShouldEnd)
    throw new BallEventError("MATCH_COMPLETED", "Match has already reached a conclusion.");

  const { striker, nonStriker } = a.lineup;
  // A batter retiring between two overs is not a ball: nobody has to be picked
  // to bowl it. The row still needs a bowler, so it keeps the last one.
  const lastEvent = a.events[a.events.length - 1];
  const bowler: SeatRef =
    isEmptySeat(a.lineup.bowler) &&
    lastEvent &&
    !isDeliveryEvent({
      extra_type: a.input.extraType ?? null,
      dismissal_type: a.input.dismissalType ?? null,
    })
      ? { athleteId: lastEvent.bowler_athlete_id ?? null, name: lastEvent.bowler_name ?? null }
      : a.lineup.bowler;
  if (isEmptySeat(striker)) throw new BallEventError("NO_STRIKER", "Select the striker.");
  if (isEmptySeat(bowler)) throw new BallEventError("NO_BOWLER", "Select the bowler.");

  validateBallDraft(
    {
      strikerAthleteId: striker.athleteId,
      strikerName: striker.name,
      nonStrikerAthleteId: nonStriker.athleteId,
      nonStrikerName: nonStriker.name,
      bowlerAthleteId: bowler.athleteId,
      bowlerName: bowler.name,
      ...a.input,
    },
    matchStateForSelectedBatters(state, striker, nonStriker),
    {
      innings: a.innings,
      events: a.events,
      matchStatus: a.matchStatus ?? null,
      totalOvers: a.enforceBowlerQuota === false ? null : a.totalOvers,
    },
  );

  const pos = nextPosition(a.events);
  const event = {
    id: a.ids.eventId,
    tenant_id: a.ids.tenantId,
    match_id: a.ids.matchId,
    innings_id: a.innings.id,
    sequence_number: pos.sequenceNumber,
    over_number: pos.overNumber,
    ball_number: pos.ballNumber,
    is_legal_delivery: countsAsBall({
      extra_type: a.input.extraType ?? null,
      dismissal_type: a.input.dismissalType ?? null,
    }),
    striker_athlete_id: striker.athleteId,
    striker_name: striker.name,
    non_striker_athlete_id: nonStriker.athleteId,
    non_striker_name: nonStriker.name,
    bowler_athlete_id: bowler.athleteId,
    bowler_name: bowler.name,
    runs_off_bat: a.input.runsOffBat ?? 0,
    extra_type: a.input.extraType ?? null,
    extra_runs: a.input.extraRuns ?? 0,
    dismissal_type: a.input.dismissalType ?? null,
    dismissed_athlete_id: a.input.dismissedAthleteId ?? null,
    dismissed_name: a.input.dismissedName ?? null,
    fielder_athlete_id: a.input.fielderAthleteId ?? null,
    fielder_name: a.input.fielderName ?? null,
    comment: a.input.comment ?? null,
    created_at: new Date().toISOString(),
    created_by: a.ids.createdBy,
  } as unknown as MCBallEvent;

  return { event, ...battersAfterBall({ striker, nonStriker }, event, a.events) };
}

/**
 * The wicket sheet's Confirm, turned into the ball to save: who is out, who
 * took the catch, and whether the batters had crossed (run out).
 */
export function wicketInput(
  r: {
    partial: BallInput;
    dismissed: "striker" | "non-striker";
    fielder: SeatRef | null;
    crossed: boolean;
  },
  lineup: { striker: SeatRef; nonStriker: SeatRef },
): BallInput {
  const who = r.dismissed === "non-striker" ? lineup.nonStriker : lineup.striker;
  const input: BallInput = {
    ...r.partial,
    fielderAthleteId: r.fielder?.athleteId ?? null,
    fielderName: r.fielder?.name ?? null,
    dismissedAthleteId: who.athleteId ?? null,
    dismissedName: who.name ?? null,
  };
  if (r.crossed && r.partial.dismissalType === "run_out")
    input.comment = addBallNote(r.partial.comment, BATTERS_CROSSED_COMMENT);
  return input;
}

/* ---------------- undo / redo ---------------- */

/**
 * The batters and bowler as they stood just BEFORE this ball. Every saved ball
 * carries that snapshot, so undo (and redo) re-seat everyone from it.
 */
export function lineupBeforeBall(event: MCBallEvent): Lineup {
  return {
    striker: {
      athleteId: event.striker_athlete_id ?? null,
      name: event.striker_name ?? null,
      onStrike: true,
    },
    nonStriker: {
      athleteId: event.non_striker_athlete_id ?? null,
      name: event.non_striker_name ?? null,
      onStrike: false,
    },
    bowler: { athleteId: event.bowler_athlete_id ?? null, name: event.bowler_name ?? null },
  };
}

/** What the scorer entered for a saved ball, so it can be entered again (redo). */
export function inputFromEvent(e: MCBallEvent): BallInput {
  return {
    runsOffBat: e.runs_off_bat ?? 0,
    extraType: (e.extra_type ?? null) as ExtraType | null,
    extraRuns: e.extra_runs ?? 0,
    dismissalType: (e.dismissal_type ?? null) as DismissalType | null,
    dismissedAthleteId: e.dismissed_athlete_id ?? null,
    dismissedName: e.dismissed_name ?? null,
    fielderAthleteId: e.fielder_athlete_id ?? null,
    fielderName: e.fielder_name ?? null,
    comment: e.comment ?? null,
  };
}

/* ---------------- re-opening a match ---------------- */

/**
 * Who is at the crease and bowling when the scorer is opened on a match that
 * already has balls. Built from the LAST saved ball with the same code that
 * moved the batters when it was scored, so a re-opened match shows exactly what
 * the scorer saw before closing it:
 *  - a batter who is out or retired is not put back,
 *  - after the 6th ball the bowler seat is empty (a new bowler is needed).
 */
export function resumeLineup(events: MCBallEvent[], state: MatchState): Lineup {
  if (events.length === 0) return emptyLineup();
  const last = events[events.length - 1];
  const before = lineupBeforeBall(last);
  const after = battersAfterBall(before, last, events.slice(0, -1));
  const out = (p: SeatRef) =>
    Boolean(
      (p.athleteId && state.innings.dismissedIds.has(p.athleteId)) ||
      (p.name && state.innings.dismissedNames.has(p.name)),
    );
  return {
    striker: out(after.striker) ? { ...EMPTY_STRIKER } : after.striker,
    nonStriker: out(after.nonStriker) ? { ...EMPTY_NON_STRIKER } : after.nonStriker,
    bowler: state.innings.awaitingNewBowler ? { ...EMPTY_BOWLER } : before.bowler,
  };
}

/* ---------------- which picker must open ---------------- */

export interface PickerState {
  strikerSelected: boolean;
  nonStrikerSelected: boolean;
  bowlerSelected: boolean;
  strikerDismissed: boolean;
  nonStrikerDismissed: boolean;
  /** The seat a new batter must fill, if any. */
  incomingBatterRole: "striker" | "nonStriker" | null;
  /** The over ended and the bowler shown is still the one who bowled it. */
  newBowlerStillNeeded: boolean;
  bowlerPickerNeededForBall: boolean;
  /** A ball tapped now must wait for a pick. */
  mustPickBeforeBall: boolean;
  /** The picker that opens (the bowler one only once a ball is waiting). */
  requiredPicker: "striker" | "nonStriker" | "bowler" | null;
}

/**
 * Does the scorer have to pick a batter or a bowler before the next ball?
 * One copy for the live scorer, the demo scorer and the tests.
 */
export function pickerState(
  lineup: { striker: SeatRef; nonStriker: SeatRef; bowler: SeatRef },
  state: MatchState,
  hasPendingBall: boolean,
): PickerState {
  const { striker, nonStriker, bowler } = lineup;
  const inn = state.innings;
  const strikerSelected = !isEmptySeat(striker);
  const nonStrikerSelected = !isEmptySeat(nonStriker);
  const bowlerSelected = !isEmptySeat(bowler);
  const isOut = (p: SeatRef) =>
    Boolean(
      (p.athleteId && inn.dismissedIds.has(p.athleteId)) ||
      (p.name && inn.dismissedNames.has(p.name)),
    );
  const strikerDismissed = isOut(striker);
  const nonStrikerDismissed = isOut(nonStriker);
  const incomingBatterRole =
    !strikerSelected || strikerDismissed
      ? "striker"
      : !nonStrikerSelected || nonStrikerDismissed
        ? "nonStriker"
        : null;
  const prev = inn.completedOvers.at(-1);
  const sameAsPreviousBowler = Boolean(
    prev &&
    ((bowler.athleteId && prev.bowlerAthleteId && bowler.athleteId === prev.bowlerAthleteId) ||
      (bowler.name && prev.bowlerName && bowler.name === prev.bowlerName)),
  );
  const newBowlerStillNeeded = Boolean(
    inn.awaitingNewBowler && (!bowlerSelected || sameAsPreviousBowler),
  );
  const bowlerPickerNeededForBall = newBowlerStillNeeded || !bowlerSelected;
  const mustPickBeforeBall = Boolean(incomingBatterRole) || bowlerPickerNeededForBall;
  const requiredPicker = state.inningsShouldEnd
    ? null
    : incomingBatterRole
      ? incomingBatterRole
      : bowlerPickerNeededForBall && hasPendingBall
        ? "bowler"
        : null;
  return {
    strikerSelected,
    nonStrikerSelected,
    bowlerSelected,
    strikerDismissed,
    nonStrikerDismissed,
    incomingBatterRole,
    newBowlerStillNeeded,
    bowlerPickerNeededForBall,
    mustPickBeforeBall,
    requiredPicker,
  };
}

/* ---------------- saving on a weak connection ---------------- */

/** Waits between tries when the internet drops at the ground (about 30 s in all). */
export const SAVE_RETRY_DELAYS_MS = [1500, 3000, 6000, 10000, 10000];

/** Is this a "no internet / server busy" failure that is worth trying again? */
export function isRetryableSaveError(e: unknown): boolean {
  if (e && typeof e === "object" && "retryable" in e) {
    return Boolean((e as { retryable?: boolean }).retryable);
  }
  return false;
}

/**
 * Try a save again after a connection failure, with the SAME data, so the ball
 * keeps its place in the over and its batters. A rule failure (the database
 * refused the row) is never retried.
 */
export async function saveWithRetry<T>(
  save: () => Promise<T>,
  opts: {
    delaysMs?: readonly number[];
    retryable?: (e: unknown) => boolean;
    wait?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, e: unknown) => void;
    /** Stop retrying (the ball was taken off meanwhile). */
    cancelled?: () => boolean;
  } = {},
): Promise<T> {
  const delays = opts.delaysMs ?? SAVE_RETRY_DELAYS_MS;
  const retryable = opts.retryable ?? isRetryableSaveError;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await save();
    } catch (e) {
      if (attempt >= delays.length || !retryable(e) || opts.cancelled?.()) throw e;
      opts.onRetry?.(attempt + 1, e);
      await wait(delays[attempt]);
      if (opts.cancelled?.()) throw e;
    }
  }
}

/* ---------------- what each scorer key saves ---------------- */

/** Each returns the input for one ball. The scorer keys call these and nothing else. */
export const ballHelpers = {
  run: (runs: 0 | 1 | 2 | 3 | 4 | 5 | 6) => ({
    runsOffBat: runs,
    extraType: null,
    extraRuns: 0,
  }),
  /** `runs` INCLUDES the 1-run wide penalty. */
  wide: (runs: number = 1) => ({
    runsOffBat: 0,
    extraType: "wide" as const,
    extraRuns: runs,
  }),
  /**
   * No-ball. The +1 penalty is added by the rules engine automatically.
   * `batRuns` = runs off the bat while the ball was live (0..6).
   * `byes`    = bye/leg-bye runs completed off the no-ball (rare).
   * `extra_runs` on a no-ball stores ONLY those byes, never the penalty.
   */
  noBall: (batRuns: number = 0, byes: number = 0, legByes: boolean = false) => ({
    runsOffBat: batRuns,
    extraType: "no_ball" as const,
    extraRuns: byes,
    ...(legByes && byes > 0 ? { comment: NO_BALL_LEG_BYES_COMMENT } : {}),
  }),
  bye: (runs: number) => ({
    runsOffBat: 0,
    extraType: "bye" as const,
    extraRuns: runs,
  }),
  legBye: (runs: number) => ({
    runsOffBat: 0,
    extraType: "leg_bye" as const,
    extraRuns: runs,
  }),
  wicket: (
    kind: DismissalType | null | undefined,
    extras?: {
      fielderAthleteId?: string | null;
      fielderName?: string | null;
      dismissedAthleteId?: string | null;
      dismissedName?: string | null;
    },
  ) => ({
    runsOffBat: 0,
    extraType: null,
    extraRuns: 0,
    dismissalType: kind ?? null,
    ...extras,
  }),
};

/**
 * Wide / No ball with extra runs, as picked in the bubble above the key:
 * the penalty run is added here, never by the scorer.
 */
export function extraDeliveryInput(
  kind: "Wide" | "No Ball",
  mode: "bat" | "bye" | "leg_bye",
  runs: number,
) {
  if (kind === "Wide") return ballHelpers.wide(1 + runs);
  return mode === "bat"
    ? ballHelpers.noBall(runs, 0)
    : ballHelpers.noBall(0, runs, mode === "leg_bye");
}
