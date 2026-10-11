import { describe, it, expect } from "vitest";
import type { MCBallEvent } from "./mc-ball-events";
import { bowlerForHeld, fixableBalls, legalBallsInOpenOver, planHeldBall } from "./mc-ball-fix";

let seq = 0;
function ball(partial: Partial<MCBallEvent> = {}): MCBallEvent {
  seq += 1;
  return {
    id: `f${seq}`,
    sequence_number: seq,
    over_number: 0,
    ball_number: 1,
    runs_off_bat: 0,
    extra_type: null,
    extra_runs: 0,
    dismissal_type: null,
    dismissed_athlete_id: null,
    dismissed_name: null,
    fielder_athlete_id: null,
    fielder_name: null,
    comment: null,
    striker_athlete_id: "a",
    striker_name: "Asha",
    non_striker_athlete_id: "b",
    non_striker_name: "Bala",
    bowler_athlete_id: "x",
    bowler_name: "Xavier",
    ...partial,
  } as unknown as MCBallEvent;
}

const asha = { athleteId: "a", name: "Asha" };
const bala = { athleteId: "b", name: "Bala" };
const chet = { athleteId: "c", name: "Chet" };
const none = { athleteId: null, name: null };

describe("planHeldBall", () => {
  it("keeps roles when strike did not move", () => {
    const plan = planHeldBall(ball({ runs_off_bat: 4 }), { striker: asha, nonStriker: bala });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.striker.name).toBe("Asha");
    expect(plan.input.runsOffBat).toBe(4);
  });

  it("accepts the batters crossed over (the fix moved strike)", () => {
    const plan = planHeldBall(ball({ runs_off_bat: 1 }), { striker: bala, nonStriker: asha });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.striker.name).toBe("Bala");
    expect(plan.nonStriker.name).toBe("Asha");
  });

  it("refuses a bowled/caught wicket when the fix moved strike to the other batter", () => {
    const held = ball({
      dismissal_type: "bowled",
      dismissed_athlete_id: "a",
      dismissed_name: "Asha",
    });
    const plan = planHeldBall(held, { striker: bala, nonStriker: asha });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain("Asha");
  });

  it("a bowled wicket goes back when strike did not move", () => {
    const held = ball({
      dismissal_type: "bowled",
      dismissed_athlete_id: "a",
      dismissed_name: "Asha",
    });
    const plan = planHeldBall(held, { striker: asha, nonStriker: bala });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.dismissedName).toBe("Asha");
  });

  it("a run out keeps the batter it named even when strike moved", () => {
    const held = ball({
      dismissal_type: "run_out",
      dismissed_athlete_id: "b",
      dismissed_name: "Bala",
    });
    const plan = planHeldBall(held, { striker: bala, nonStriker: asha });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.dismissedName).toBe("Bala");
  });

  it("fills the empty slot with the batter who came in after a wicket", () => {
    // earlier ball: Asha out; this ball was played by Chet (new) and Bala
    const held = ball({
      striker_athlete_id: "c",
      striker_name: "Chet",
      non_striker_athlete_id: "b",
      non_striker_name: "Bala",
    });
    const plan = planHeldBall(held, { striker: none, nonStriker: bala });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.striker.name).toBe("Chet");
    expect(plan.nonStriker.name).toBe("Bala");
  });

  it("stops when the later balls were played by someone who is not at the crease", () => {
    const held = ball({
      striker_athlete_id: "c",
      striker_name: "Chet",
      non_striker_athlete_id: "b",
      non_striker_name: "Bala",
    });
    // the fix removed the wicket, so Asha and Bala are still in
    const plan = planHeldBall(held, { striker: asha, nonStriker: bala });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain("Chet");
  });

  it("stops when nobody is at the crease", () => {
    const plan = planHeldBall(ball(), { striker: none, nonStriker: none });
    expect(plan.ok).toBe(false);
  });

  it("copies runs, extras and the fielder", () => {
    const held = ball({
      extra_type: "no_ball",
      extra_runs: 1,
      runs_off_bat: 4,
      dismissal_type: "run_out",
      dismissed_athlete_id: "b",
      dismissed_name: "Bala",
      fielder_name: "Chet",
    });
    const plan = planHeldBall(held, { striker: asha, nonStriker: bala });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input).toMatchObject({
      extraType: "no_ball",
      extraRuns: 1,
      runsOffBat: 4,
      fielderName: "Chet",
    });
  });

  it("matches batters without ids by name", () => {
    const held = ball({
      striker_athlete_id: null,
      non_striker_athlete_id: null,
    });
    const plan = planHeldBall(held, {
      striker: { athleteId: null, name: "Bala" },
      nonStriker: { athleteId: null, name: "Asha" },
    });
    expect(plan.ok).toBe(true);
    void chet;
  });
});

describe("bowlerForHeld", () => {
  const held = ball({ bowler_athlete_id: "y", bowler_name: "Yusuf" });
  const xavier = { athleteId: "x", name: "Xavier" };

  it("a new over uses the bowler the ball was first bowled by", () => {
    const sixLegal = Array.from({ length: 6 }, (_, i) => ball({ over_number: 0, ball_number: i + 1 }));
    expect(legalBallsInOpenOver(sixLegal)).toBe(0);
    expect(bowlerForHeld(held, xavier, sixLegal).name).toBe("Yusuf");
  });

  it("the very first ball uses the recorded bowler", () => {
    expect(bowlerForHeld(held, xavier, []).name).toBe("Yusuf");
  });

  it("in the middle of an over the bowler is not swapped", () => {
    const three = Array.from({ length: 3 }, (_, i) => ball({ over_number: 0, ball_number: i + 1 }));
    expect(legalBallsInOpenOver(three)).toBe(3);
    expect(bowlerForHeld(held, xavier, three).name).toBe("Xavier");
  });

  it("wides do not count towards the six", () => {
    const evs = [
      ...Array.from({ length: 5 }, (_, i) => ball({ over_number: 0, ball_number: i + 1 })),
      ball({ over_number: 0, ball_number: 6, extra_type: "wide", extra_runs: 1 }),
    ];
    expect(legalBallsInOpenOver(evs)).toBe(5);
  });
});

describe("fixableBalls", () => {
  it("lists newest first with scorer-style over numbers", () => {
    const evs = [
      ball({ over_number: 0, ball_number: 1, runs_off_bat: 4 }),
      ball({ over_number: 0, ball_number: 2, extra_type: "wide", extra_runs: 1 }),
      ball({ over_number: 1, ball_number: 1, dismissal_type: "bowled" }),
    ];
    const list = fixableBalls(evs);
    expect(list.map((b) => b.overLabel)).toEqual([
      "Over 2 · ball 1",
      "Over 1 · extra",
      "Over 1 · ball 1",
    ]);
    expect(list[0].chip).toBe("W");
    expect(list[2].chip).toBe("4");
    expect(list[1].isExtra).toBe(true);
  });
});

/* ---------------- whole-innings simulation ----------------
 * A fake scorer session that records balls the way the live scorer does
 * (same position, strike and wicket rules), so "fix then re-apply" can be
 * compared with scoring the corrected innings from scratch.
 */
import { applyStrikeAfterBall } from "./mc-rules-engine";
import { nextPosition } from "./mc-ball-events";
import { countsAsBall } from "./mc-ball-events-core";
import { reapplyBalls, type HeldBallInput, type PlayerRef } from "./mc-ball-fix";

type Live = { striker: PlayerRef & { onStrike: boolean }; nonStriker: PlayerRef & { onStrike: boolean }; bowler: PlayerRef };

function fakeSession(opening: [PlayerRef, PlayerRef], bowler: PlayerRef, nextBatters: PlayerRef[], nextBowlers: PlayerRef[]) {
  let events: MCBallEvent[] = [];
  let idc = 0;
  const live: Live = {
    striker: { ...opening[0], onStrike: true },
    nonStriker: { ...opening[1], onStrike: false },
    bowler,
  };
  const batters = [...nextBatters];
  const bowlers = [...nextBowlers];

  const session = {
    get events() {
      return events;
    },
    getLive: () => ({ striker: live.striker, nonStriker: live.nonStriker, bowler: live.bowler }),
    setStriker: (b: Live["striker"]) => {
      live.striker = b;
    },
    setNonStriker: (b: Live["nonStriker"]) => {
      live.nonStriker = b;
    },
    setBowler: (b: PlayerRef) => {
      live.bowler = b;
    },
    async submitBall(input: HeldBallInput): Promise<MCBallEvent> {
      const pos = nextPosition(events);
      idc += 1;
      const e = {
        id: `s${idc}`,
        sequence_number: pos.sequenceNumber,
        over_number: pos.overNumber,
        ball_number: pos.ballNumber,
        is_legal_delivery: countsAsBall({ extra_type: input.extraType, dismissal_type: input.dismissalType }),
        striker_athlete_id: live.striker.athleteId,
        striker_name: live.striker.name,
        non_striker_athlete_id: live.nonStriker.athleteId,
        non_striker_name: live.nonStriker.name,
        bowler_athlete_id: live.bowler.athleteId,
        bowler_name: live.bowler.name,
        runs_off_bat: input.runsOffBat,
        extra_type: input.extraType,
        extra_runs: input.extraRuns,
        dismissal_type: input.dismissalType,
        dismissed_athlete_id: input.dismissedAthleteId,
        dismissed_name: input.dismissedName,
        fielder_athlete_id: input.fielderAthleteId,
        fielder_name: input.fielderName,
        comment: input.comment,
      } as unknown as MCBallEvent;
      const legalBefore = events.filter((x) => x.over_number === e.over_number && countsAsBall(x)).length;
      const overCompleted = e.is_legal_delivery && legalBefore + 1 >= 6;
      events = [...events, e];
      const rotated = applyStrikeAfterBall(
        { striker: live.striker, nonStriker: live.nonStriker },
        e,
        overCompleted,
      ) as { striker: Live["striker"]; nonStriker: Live["nonStriker"] };
      live.striker = { ...rotated.striker, onStrike: true };
      live.nonStriker = { ...rotated.nonStriker, onStrike: false };
      if (e.dismissal_type && e.dismissed_name) {
        if (samePlayerTest(live.striker, { athleteId: e.dismissed_athlete_id, name: e.dismissed_name })) {
          live.striker = { athleteId: null, name: null, onStrike: true };
        } else if (samePlayerTest(live.nonStriker, { athleteId: e.dismissed_athlete_id, name: e.dismissed_name })) {
          live.nonStriker = { athleteId: null, name: null, onStrike: false };
        }
      }
      return e;
    },
    async undo(): Promise<MCBallEvent | null> {
      const last = events[events.length - 1];
      if (!last) return null;
      events = events.slice(0, -1);
      live.striker = { athleteId: last.striker_athlete_id, name: last.striker_name, onStrike: true };
      live.nonStriker = { athleteId: last.non_striker_athlete_id, name: last.non_striker_name, onStrike: false };
      live.bowler = { athleteId: last.bowler_athlete_id, name: last.bowler_name };
      return last;
    },
    /** What the scorer does by hand: pick the next batter and bowler when asked. */
    fillBatter() {
      const b = batters.shift();
      if (!b) return;
      if (!live.striker.athleteId && !live.striker.name) live.striker = { ...b, onStrike: true };
      else live.nonStriker = { ...b, onStrike: false };
    },
    nextBowler() {
      const b = bowlers.shift();
      if (b) live.bowler = b;
    },
  };
  return session;
}

function samePlayerTest(a: PlayerRef, b: PlayerRef) {
  return a.athleteId && b.athleteId ? a.athleteId === b.athleteId : Boolean(a.name && b.name && a.name === b.name);
}

type Intent =
  | { swap: true }
  | { runs: number }
  | { extra: "wide" | "no_ball" | "bye" | "leg_bye"; extraRuns: number; runs?: number }
  | { out: "bowled" | "caught"; end: "striker" };

type Sess = ReturnType<typeof fakeSession>;

async function play(s: Sess, intent: Intent): Promise<MCBallEvent | null> {
  const live = s.getLive();
  if ("swap" in intent) {
    // the scorer taps "swap strike" by hand: no ball, only who is on strike
    s.setStriker({ ...live.nonStriker, onStrike: true });
    s.setNonStriker({ ...live.striker, onStrike: false });
    return null;
  }
  const base: HeldBallInput = {
    runsOffBat: 0,
    extraType: null,
    extraRuns: 0,
    dismissalType: null,
    dismissedAthleteId: null,
    dismissedName: null,
    fielderAthleteId: null,
    fielderName: null,
    comment: null,
  };
  if ("runs" in intent && !("extra" in intent)) base.runsOffBat = intent.runs;
  if ("extra" in intent) {
    base.extraType = intent.extra;
    base.extraRuns = intent.extraRuns;
    base.runsOffBat = intent.runs ?? 0;
  }
  if ("out" in intent) {
    base.dismissalType = intent.out;
    base.dismissedAthleteId = live.striker.athleteId;
    base.dismissedName = live.striker.name;
    if (intent.out === "caught") base.fielderName = "Fielder";
  }
  const e = await s.submitBall(base);
  // the scorer picks the next batter after a wicket and the next bowler after an over
  if ("out" in intent) s.fillBatter();
  const legalInOver = s.events.filter((x) => x.over_number === e.over_number && countsAsBall(x)).length;
  if (legalInOver >= 6) s.nextBowler();
  return e;
}

const P = (id: string, name: string): PlayerRef => ({ athleteId: id, name });
const A = P("a", "Asha");
const B = P("b", "Bala");
const C = P("c", "Chet");
const D = P("d", "Dev");
const X = P("x", "Xavier");
const Y = P("y", "Yusuf");
const Z = P("z", "Zoya");

function fresh() {
  return fakeSession([A, B], X, [C, D], [Y, Z, X]);
}

async function playAll(s: Sess, script: Intent[]) {
  for (const i of script) await play(s, i);
}

function project(events: MCBallEvent[]) {
  return events.map((e) =>
    [
      e.over_number,
      e.ball_number,
      e.striker_name,
      e.non_striker_name,
      e.bowler_name,
      e.runs_off_bat,
      e.extra_type ?? "-",
      e.extra_runs,
      e.dismissal_type ?? "-",
      e.dismissed_name ?? "-",
    ].join("|"),
  );
}

/** Go back to ball `index`, enter `fixed`, then put the later balls back. */
async function fixBall(s: Sess, index: number, fixed: Intent) {
  const removed: MCBallEvent[] = [];
  while (s.events.length > index) {
    const r = await s.undo();
    if (!r) break;
    removed.unshift(r);
  }
  const held = removed.slice(1);
  await play(s, fixed);
  const result = await reapplyBalls(
    {
      getLive: s.getLive,
      setStriker: s.setStriker,
      setNonStriker: s.setNonStriker,
      setBowler: s.setBowler,
      submitBall: (i) => s.submitBall(i),
    },
    held,
    [...s.events],
    () => {},
    removed[0],
  );
  return { removed, result };
}

describe("fix an earlier ball: whole innings", () => {
  const over1: Intent[] = [{ runs: 0 }, { runs: 1 }, { runs: 2 }, { runs: 4 }, { runs: 1 }, { runs: 0 }];
  const over2: Intent[] = [
    { runs: 1 },
    { extra: "wide", extraRuns: 1 },
    { runs: 0 },
    { runs: 2 },
    { runs: 3 },
    { runs: 1 },
    { runs: 0 },
  ];

  it("a fix that moves strike matches scoring the corrected innings from scratch", async () => {
    const s = fresh();
    await playAll(s, [...over1, ...over2]);
    const { result } = await fixBall(s, 1, { runs: 2 }); // 1 became 2: strike no longer swaps here
    expect(result.error).toBeNull();
    expect(result.left).toHaveLength(0);

    const expected = fresh();
    const corrected = [...over1, ...over2];
    corrected[1] = { runs: 2 };
    await playAll(expected, corrected);
    expect(project(s.events)).toEqual(project(expected.events));
  });

  it("the bowler of the next over is kept when the fix leaves the over structure alone", async () => {
    const s = fresh();
    await playAll(s, [...over1, ...over2]);
    await fixBall(s, 4, { runs: 3 }); // last-but-one ball of over 1
    const bowlers = s.events.map((e) => `${e.over_number}:${e.bowler_name}`);
    expect(new Set(bowlers.filter((b) => b.startsWith("0:")))).toEqual(new Set(["0:Xavier"]));
    expect(new Set(bowlers.filter((b) => b.startsWith("1:")))).toEqual(new Set(["1:Yusuf"]));
  });

  it("fixing the very last ball needs nothing re-applied", async () => {
    const s = fresh();
    await playAll(s, [...over1, ...over2]);
    const last = s.events.length - 1;
    const { result } = await fixBall(s, last, { runs: 6 });
    expect(result.error).toBeNull();
    expect(s.events).toHaveLength(over1.length + over2.length);
    expect(s.events[last].runs_off_bat).toBe(6);
  });

  it("a fix that keeps strike also carries a later wicket and the incoming batter", async () => {
    const script: Intent[] = [
      { runs: 0 },
      { runs: 1 },
      { runs: 2 },
      { out: "bowled", end: "striker" },
      { runs: 1 },
      { runs: 0 },
      { runs: 4 },
      { runs: 1 },
      { runs: 0 },
      { runs: 2 },
    ];
    const s = fresh();
    await playAll(s, script);
    const { result } = await fixBall(s, 1, { runs: 3 }); // 1 -> 3: both odd, strike unchanged
    expect(result.error).toBeNull();
    const expected = fresh();
    const corrected = [...script];
    corrected[1] = { runs: 3 };
    await playAll(expected, corrected);
    expect(project(s.events)).toEqual(project(expected.events));
  });

  it("stops with a plain reason when a later wicket no longer fits after strike moved", async () => {
    const script: Intent[] = [
      { runs: 0 },
      { runs: 1 },
      { runs: 2 },
      { out: "bowled", end: "striker" },
      { runs: 1 },
      { runs: 0 },
    ];
    const s = fresh();
    await playAll(s, script);
    const { result } = await fixBall(s, 1, { runs: 2 }); // 1 -> 2: strike moves, a different batter faces the wicket ball
    expect(result.error).not.toBeNull();
    expect(result.error).toContain("Stopped at");
    // the balls before the wicket went back, the wicket and the balls after stay held
    expect(result.left.length).toBe(3);
    expect(result.left[0].dismissal_type).toBe("bowled");
  });

  it("Put it back restores the innings exactly", async () => {
    const s = fresh();
    await playAll(s, [...over1, ...over2]);
    const before = project(s.events);
    const removed: MCBallEvent[] = [];
    while (s.events.length > 3) {
      const r = await s.undo();
      if (!r) break;
      removed.unshift(r);
    }
    const result = await reapplyBalls(
      {
        getLive: s.getLive,
        setStriker: s.setStriker,
        setNonStriker: s.setNonStriker,
        setBowler: s.setBowler,
        submitBall: (i) => s.submitBall(i),
      },
      removed,
      [...s.events],
      () => {},
    );
    expect(result.error).toBeNull();
    expect(project(s.events)).toEqual(before);
  });

  it("wides and no-balls in the held balls stay out of the over count", async () => {
    const s = fresh();
    await playAll(s, [...over1, ...over2]);
    await fixBall(s, 6, { runs: 2 }); // first ball of over 2
    const wide = s.events.find((e) => e.extra_type === "wide");
    expect(wide?.over_number).toBe(1);
    expect(s.events.filter((e) => e.over_number === 1 && countsAsBall(e))).toHaveLength(6);
    expect(s.events.filter((e) => e.over_number === 1)).toHaveLength(7); // six balls and the wide
    expect(s.events.filter((e) => e.over_number === 2)).toHaveLength(0);
  });

  it("a manual strike swap made after the fixed ball is kept", async () => {
    const script: Intent[] = [
      { runs: 0 },
      { runs: 1 },
      { runs: 2 },
      { runs: 0 },
      { swap: true }, // scorer corrects who is on strike by hand
      { runs: 1 },
      { runs: 4 },
      { runs: 0 },
    ];
    // same parity: 1 -> 3
    const s1 = fresh();
    await playAll(s1, script);
    await fixBall(s1, 1, { runs: 3 });
    const e1 = fresh();
    const c1 = [...script];
    c1[1] = { runs: 3 };
    await playAll(e1, c1);
    expect(project(s1.events)).toEqual(project(e1.events));

    // parity moves: 1 -> 2
    const s2 = fresh();
    await playAll(s2, script);
    const { result } = await fixBall(s2, 1, { runs: 2 });
    expect(result.error).toBeNull();
    const e2 = fresh();
    const c2 = [...script];
    c2[1] = { runs: 2 };
    await playAll(e2, c2);
    expect(project(s2.events)).toEqual(project(e2.events));
  });
});
