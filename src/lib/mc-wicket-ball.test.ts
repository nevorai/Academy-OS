import { describe, it, expect } from "vitest";
import type { MCBallEvent } from "./mc-ball-events";
import { countsAsBall } from "./mc-ball-events-core";
import { replayInnings } from "./mc-rules-engine";
import { playersPerSide, wicketLimit, wicketLimitForTeam } from "./mc-match-rules";
import { buildWicketBall, deliveriesAllowedFor, isNonDeliveryKind } from "./mc-wicket-ball";

let seq = 0;
function ball(partial: Partial<MCBallEvent> = {}): MCBallEvent {
  seq += 1;
  return {
    id: `w${seq}`,
    over_number: 0,
    ball_number: seq,
    runs_off_bat: 0,
    extra_type: null,
    extra_runs: 0,
    dismissal_type: null,
    dismissed_athlete_id: null,
    dismissed_name: null,
    striker_athlete_id: null,
    striker_name: "A",
    non_striker_athlete_id: null,
    non_striker_name: "B",
    bowler_athlete_id: null,
    bowler_name: "Bowler 1",
    ...partial,
  } as unknown as MCBallEvent;
}

/** Turn a builder result into the stored event fields. */
function ev(
  p: { runsOffBat: number; extraType: string | null; extraRuns: number; dismissalType: string },
  extra: Partial<MCBallEvent> = {},
): MCBallEvent {
  return ball({
    runs_off_bat: p.runsOffBat,
    extra_type: p.extraType,
    extra_runs: p.extraRuns,
    dismissal_type: p.dismissalType,
    ...extra,
  } as Partial<MCBallEvent>);
}

describe("wicket + runs + extras in ONE ball", () => {
  it("run out after 2 runs on a legal ball: 2 runs, 1 wicket, 1 ball, strike not swapped", () => {
    const p = buildWicketBall({ kind: "run_out", delivery: "legal", runs: 2, credit: "bat" });
    expect(p).toEqual({ runsOffBat: 2, extraType: null, extraRuns: 0, dismissalType: "run_out" });
    const s = replayInnings([ev(p, { dismissed_name: "B" } as Partial<MCBallEvent>)]);
    expect(s.innings.runs).toBe(2);
    expect(s.innings.wickets).toBe(1);
    expect(s.innings.legalBalls).toBe(1);
    expect(s.innings.striker.name).toBe("A");
  });

  it("run out after 1 run: strike swaps, the survivor ends up on the other end", () => {
    const p = buildWicketBall({ kind: "run_out", delivery: "legal", runs: 1, credit: "bat" });
    const s = replayInnings([ev(p, { dismissed_name: "A" } as Partial<MCBallEvent>)]);
    expect(s.innings.runs).toBe(1);
    expect(s.innings.striker.name).toBe("B");
    expect(s.innings.nonStriker.name).toBe("A"); // dismissed; the vacated end
  });

  it("stumped off a wide: wide run + wicket, and NO ball used from the over", () => {
    const p = buildWicketBall({ kind: "stumped", delivery: "wide", runs: 0, credit: "bat" });
    expect(p).toEqual({ runsOffBat: 0, extraType: "wide", extraRuns: 1, dismissalType: "stumped" });
    const s = replayInnings([ev(p, { dismissed_name: "A" } as Partial<MCBallEvent>)]);
    expect(s.innings.runs).toBe(1);
    expect(s.innings.wickets).toBe(1);
    expect(s.innings.legalBalls).toBe(0);
  });

  it("run out off a wide after 1 run: 2 wides, still no legal ball", () => {
    const p = buildWicketBall({ kind: "run_out", delivery: "wide", runs: 1, credit: "bat" });
    expect(p.extraRuns).toBe(2);
    const s = replayInnings([ev(p, { dismissed_name: "B" } as Partial<MCBallEvent>)]);
    expect(s.innings.runs).toBe(2);
    expect(s.innings.legalBalls).toBe(0);
  });

  it("run out off a no-ball after 1 bat run: 2 runs, free hit next, no legal ball", () => {
    const p = buildWicketBall({ kind: "run_out", delivery: "no_ball", runs: 1, credit: "bat" });
    expect(p).toEqual({ runsOffBat: 1, extraType: "no_ball", extraRuns: 0, dismissalType: "run_out" });
    const s = replayInnings([ev(p, { dismissed_name: "B" } as Partial<MCBallEvent>)]);
    expect(s.innings.runs).toBe(2);
    expect(s.innings.legalBalls).toBe(0);
    expect(s.innings.freeHit).toBe(true);
  });

  it("run out with byes: runs go to extras, not the batter", () => {
    const p = buildWicketBall({ kind: "run_out", delivery: "legal", runs: 1, credit: "bye" });
    expect(p).toEqual({ runsOffBat: 0, extraType: "bye", extraRuns: 1, dismissalType: "run_out" });
  });

  it("a bowled/caught wicket never carries runs even if runs are passed in", () => {
    const p = buildWicketBall({ kind: "bowled", delivery: "legal", runs: 3, credit: "bat" });
    expect(p.runsOffBat).toBe(0);
  });
});

describe("which deliveries each dismissal can happen on", () => {
  it("bowled/caught/lbw only on a normal ball", () => {
    expect(deliveriesAllowedFor("bowled")).toEqual(["legal"]);
    expect(deliveriesAllowedFor("caught")).toEqual(["legal"]);
    expect(deliveriesAllowedFor("lbw")).toEqual(["legal"]);
  });
  it("stumped: normal ball or wide", () => {
    expect(deliveriesAllowedFor("stumped")).toEqual(["legal", "wide"]);
  });
  it("run out: any delivery", () => {
    expect(deliveriesAllowedFor("run_out")).toEqual(["legal", "wide", "no_ball"]);
  });
  it("on a free hit only run out / obstructing / hit twice on a normal ball", () => {
    expect(deliveriesAllowedFor("bowled", true)).toEqual([]);
    expect(deliveriesAllowedFor("run_out", true)).toContain("legal");
  });
});

describe("balls that are not deliveries", () => {
  it("penalty runs are 5 runs but not a ball", () => {
    const e = ball({ extra_type: "penalty", extra_runs: 5 });
    expect(countsAsBall(e)).toBe(false);
    const s = replayInnings([e]);
    expect(s.innings.runs).toBe(5);
    expect(s.innings.legalBalls).toBe(0);
  });

  it("retired hurt between balls is not a dot ball and does not end the over early", () => {
    expect(isNonDeliveryKind("retired_hurt")).toBe(true);
    const p = buildWicketBall({ kind: "retired_hurt", delivery: "wide", runs: 4, credit: "bat" });
    expect(p).toEqual({ runsOffBat: 0, extraType: null, extraRuns: 0, dismissalType: "retired_hurt" });
    const events = [
      ball({ runs_off_bat: 1 }),
      ev(p, { dismissed_name: "A" } as Partial<MCBallEvent>),
      ball({ runs_off_bat: 0 }),
    ];
    const s = replayInnings(events);
    expect(s.innings.legalBalls).toBe(2);
    expect(s.innings.wickets).toBe(0);
  });

  it("retired hurt after a no-ball does not use up the free hit", () => {
    const p = buildWicketBall({ kind: "retired_hurt", delivery: "legal", runs: 0, credit: "bat" });
    const s = replayInnings([
      ball({ extra_type: "no_ball" }),
      ev(p, { dismissed_name: "A" } as Partial<MCBallEvent>),
    ]);
    expect(s.innings.freeHit).toBe(true);
  });
});

describe("side size: all out depends on the players, not a fixed 10", () => {
  const squad = (n: number, team = "t1") =>
    Array.from({ length: n }, () => ({ team_id: team, is_playing: true, is_substitute: false }));

  it("limits", () => {
    expect(wicketLimit(11)).toBe(10);
    expect(wicketLimit(9)).toBe(8);
    expect(wicketLimit(8)).toBe(7);
    expect(wicketLimit(15)).toBe(10);
    expect(wicketLimit(null)).toBe(10);
  });
  it("ignores substitutes and the other team", () => {
    const s = [...squad(9), ...squad(11, "t2"), { team_id: "t1", is_playing: false, is_substitute: true }];
    expect(playersPerSide(s, "t1")).toBe(9);
    expect(wicketLimitForTeam(s, "t1")).toBe(8);
    expect(wicketLimitForTeam(s, "t2")).toBe(10);
  });
  it("a 9-a-side innings ends all out on the 8th wicket", () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      ball({ over_number: Math.floor(i / 6), dismissal_type: "bowled", dismissed_name: `P${i}` }),
    );
    expect(replayInnings(events, { maxWickets: 8 }).inningsShouldEnd).toBe("all_out");
    expect(replayInnings(events, { maxWickets: 10 }).inningsShouldEnd).toBe(null);
  });
});
