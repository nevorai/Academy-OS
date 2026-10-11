/* ================================================================
 * Wicket ball builder
 * ----------------------------------------------------------------
 * One ball can carry a wicket AND runs AND a wide or no-ball: a run out after
 * two runs, a stumping off a wide, a run out off a no-ball. This turns what
 * the scorer picks into the single ball event the rules engine understands.
 * Pure, no database access.
 * ================================================================ */

import type { DismissalType, ExtraType } from "@/lib/mc-ball-events-core";
import { NON_DELIVERY_DISMISSALS } from "@/lib/mc-ball-events-core";
import { dismissalAllowedOnDelivery } from "@/lib/mc-rules-engine";

export type DeliveryKind = "legal" | "wide" | "no_ball";
export type RunsCredit = "bat" | "bye" | "leg_bye";

export interface WicketBallInput {
  kind: DismissalType;
  delivery: DeliveryKind;
  /** Runs the batters completed before the wicket (run out / obstructing only). */
  runs: number;
  /** Who the completed runs are credited to. */
  credit: RunsCredit;
}

export interface WicketBallPartial {
  runsOffBat: number;
  extraType: ExtraType | null;
  extraRuns: number;
  dismissalType: DismissalType;
}

/** Dismissals where the batters may have run before the wicket fell. */
export function takesRuns(kind: DismissalType): boolean {
  return kind === "run_out" || kind === "obstructing_field";
}

/** Retiring or being timed out happens between balls: no delivery is bowled. */
export function isNonDeliveryKind(kind: DismissalType): boolean {
  return (NON_DELIVERY_DISMISSALS as readonly string[]).includes(kind);
}

/** Dismissals that need a fielder (or keeper) named. */
export function needsFielder(kind: DismissalType): boolean {
  return kind === "caught" || kind === "run_out" || kind === "stumped";
}

/** Dismissals where either batter can be the one who is out. */
export function canChooseWhoIsOut(kind: DismissalType): boolean {
  return (
    kind === "run_out" ||
    kind === "obstructing_field" ||
    kind === "retired_hurt" ||
    kind === "retired_out" ||
    kind === "timed_out"
  );
}

/** Which kinds of delivery this dismissal is possible on (Laws 21.19, 22.6, free hit). */
export function deliveriesAllowedFor(kind: DismissalType, freeHit = false): DeliveryKind[] {
  if (isNonDeliveryKind(kind)) return ["legal"];
  const out: DeliveryKind[] = [];
  if (dismissalAllowedOnDelivery(kind, null, freeHit)) out.push("legal");
  if (dismissalAllowedOnDelivery(kind, "wide", false)) out.push("wide");
  if (dismissalAllowedOnDelivery(kind, "no_ball", false)) out.push("no_ball");
  return out;
}

export function buildWicketBall(input: WicketBallInput): WicketBallPartial {
  const { kind } = input;
  if (isNonDeliveryKind(kind)) {
    return { runsOffBat: 0, extraType: null, extraRuns: 0, dismissalType: kind };
  }

  const runs = takesRuns(kind) ? Math.max(0, Math.min(6, Math.floor(input.runs || 0))) : 0;

  if (input.delivery === "wide") {
    // Runs run off a wide are all wides, plus the 1-run penalty.
    return { runsOffBat: 0, extraType: "wide", extraRuns: 1 + runs, dismissalType: kind };
  }

  if (input.delivery === "no_ball") {
    // The engine adds the 1-run no-ball penalty itself; extra_runs holds byes only.
    return input.credit === "bat"
      ? { runsOffBat: runs, extraType: "no_ball", extraRuns: 0, dismissalType: kind }
      : { runsOffBat: 0, extraType: "no_ball", extraRuns: runs, dismissalType: kind };
  }

  if (input.credit === "bye" && runs > 0) {
    return { runsOffBat: 0, extraType: "bye", extraRuns: runs, dismissalType: kind };
  }
  if (input.credit === "leg_bye" && runs > 0) {
    return { runsOffBat: 0, extraType: "leg_bye", extraRuns: runs, dismissalType: kind };
  }
  return { runsOffBat: runs, extraType: null, extraRuns: 0, dismissalType: kind };
}
