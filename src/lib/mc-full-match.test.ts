/* ================================================================
 * WHOLE-MATCH TEST
 * ----------------------------------------------------------------
 * Plays complete matches ball by ball through the SAME code the
 * scorer screen uses (mc-scoring-core: prepareBall, undo/redo
 * line-ups, resumeLineup, pickerState, the key helpers; mc-wicket-ball;
 * mc-ball-fix; the rules engine and the statistics engine).
 *
 * After EVERY ball it compares the app with an independent tally kept
 * by this file ("the book"): total, wickets, overs, who is on strike,
 * each batter's runs and balls, each bowler's overs / runs / wickets /
 * maidens, the extras breakdown, the free hit flag. It then "closes
 * and re-opens" the scorer (rebuilds from the saved balls only) and
 * checks the screen would ask for exactly the people it really does
 * not know, and nobody else.
 * ================================================================ */

import { describe, expect, it } from "vitest";
import type { DismissalType, MCBallEvent, MCInnings } from "@/lib/mc-ball-events";
import { BallEventError } from "@/lib/mc-ball-events-core";
import { reapplyBalls } from "@/lib/mc-ball-fix";
import { detectMatchResult, type InningsRow } from "@/lib/mc-finalization";
import { wicketLimit } from "@/lib/mc-match-rules";
import { replayInnings, totalRunsForBall } from "@/lib/mc-rules-engine";
import {
  ballHelpers,
  emptyLineup,
  extraDeliveryInput,
  inputFromEvent,
  isEmptySeat,
  lineupBeforeBall,
  pickerState,
  prepareBall,
  resumeLineup,
  saveWithRetry,
  type BallInput,
  type Lineup,
  type SeatRef,
  wicketInput,
} from "@/lib/mc-scoring-core";
import {
  computeInningsStatistics,
  computeOverHistory,
  formatLiveOver,
  formatOversCompact,
} from "@/lib/mc-statistics-engine";
import {
  buildWicketBall,
  canChooseWhoIsOut,
  deliveriesAllowedFor,
  isNonDeliveryKind,
  needsFielder,
  takesRuns,
  type DeliveryKind,
  type RunsCredit,
} from "@/lib/mc-wicket-ball";

/* ================================================================
 * 1. The scorer, without a screen. Mirrors use-scoring-session.ts,
 *    use-ball-actions.tsx and the scorer route: every method is a few
 *    lines of glue around the shared core functions.
 * ================================================================ */

interface MatchCfg {
  totalOvers: number;
  maxWickets: number;
  target: number | null;
  inningsId: string;
}

class Scorer {
  events: MCBallEvent[] = []; // what is saved in the database
  lineup: Lineup = emptyLineup(); // what the screen shows
  redoStack: MCBallEvent[] = [];
  private seq = 0;
  constructor(readonly cfg: MatchCfg) {}

  get innings(): MCInnings {
    return {
      id: this.cfg.inningsId,
      status: "in_progress",
      target: this.cfg.target,
    } as unknown as MCInnings;
  }
  state() {
    return replayInnings(this.events, {
      totalOvers: this.cfg.totalOvers,
      maxWickets: this.cfg.maxWickets,
      target: this.cfg.target,
    });
  }
  stats() {
    return computeInningsStatistics(this.events, {
      totalOvers: this.cfg.totalOvers,
      target: this.cfg.target,
    });
  }

  /** The route's setPlayer(): tap a name in a picker. */
  pick(slot: "striker" | "nonStriker" | "bowler", p: SeatRef) {
    if (slot === "bowler") {
      this.lineup = { ...this.lineup, bowler: { ...p } };
      return;
    }
    this.lineup =
      slot === "striker"
        ? { ...this.lineup, striker: { ...p, onStrike: true } }
        : { ...this.lineup, nonStriker: { ...p, onStrike: false } };
  }

  /** The hook's submitBall(). */
  submit(input: BallInput): MCBallEvent {
    const prepared = prepareBall({
      events: this.events,
      lineup: this.lineup,
      input,
      innings: this.innings,
      matchStatus: "live",
      totalOvers: this.cfg.totalOvers,
      maxWickets: this.cfg.maxWickets,
      ids: { eventId: `ev-${(this.seq += 1)}`, tenantId: "t", matchId: "m", createdBy: null },
    });
    // through JSON, as the row comes back from the database
    const saved = JSON.parse(JSON.stringify(prepared.event)) as MCBallEvent;
    this.events = [...this.events, saved];
    this.lineup = { ...this.lineup, striker: prepared.striker, nonStriker: prepared.nonStriker };
    return saved;
  }

  /** A scoring key: requestSubmit() in use-ball-actions. The screen opens a picker instead when someone is missing. */
  tap(input: BallInput): MCBallEvent {
    const p = pickerState(this.lineup, this.state(), true);
    if (p.mustPickBeforeBall) throw new Error(`screen asks for a pick first: ${p.requiredPicker}`);
    const e = this.submit(input);
    this.redoStack = [];
    return e;
  }

  /** The wicket sheet's Confirm: handleWicket() in use-ball-actions. */
  wicket(r: {
    partial: BallInput;
    dismissed: "striker" | "non-striker";
    fielder: SeatRef | null;
    crossed: boolean;
  }): MCBallEvent {
    const e = this.submit(wicketInput(r, this.lineup));
    this.redoStack = [];
    return e;
  }

  /** Undo key: the hook's undo() + handleUndo(). */
  undo(): MCBallEvent | null {
    const removed = this.events[this.events.length - 1] ?? null;
    if (!removed) return null;
    this.events = this.events.slice(0, -1);
    this.lineup = lineupBeforeBall(removed);
    this.redoStack = [...this.redoStack, removed];
    return removed;
  }

  /** Redo key: handleRedo(). */
  redo(): MCBallEvent | null {
    const next = this.redoStack[this.redoStack.length - 1];
    if (!next) return null;
    this.redoStack = this.redoStack.slice(0, -1);
    this.lineup = lineupBeforeBall(next);
    return this.submit(inputFromEvent(next));
  }

  /** Close the scorer and open it again: only the saved balls survive. */
  reopened(): Scorer {
    const s = new Scorer(this.cfg);
    s.events = JSON.parse(JSON.stringify(this.events)) as MCBallEvent[];
    s.seq = this.seq + 1000;
    s.lineup = resumeLineup(s.events, s.state());
    return s;
  }

  /** "Wrong ball?": go back to ball `index`, enter `fixed`, put the later balls back. */
  async fixBall(index: number, fixed: BallInput): Promise<string | null> {
    const held: MCBallEvent[] = [];
    while (this.events.length > index) held.unshift(this.undo()!);
    this.redoStack = [];
    const [original, ...later] = held;
    this.tap(fixed);
    const result = await reapplyBalls(
      {
        getLive: () => this.lineup,
        setStriker: (b) => (this.lineup = { ...this.lineup, striker: b }),
        setNonStriker: (b) => (this.lineup = { ...this.lineup, nonStriker: b }),
        setBowler: (b) => (this.lineup = { ...this.lineup, bowler: b }),
        submitBall: async (input) => this.submit(input),
      },
      later,
      this.events,
      () => {},
      original,
    );
    return result.error;
  }
}

/* ================================================================
 * 2. The book: an independent tally. It never calls the app's rules,
 *    it only follows the laws written out plainly below.
 * ================================================================ */

type Who = "striker" | "non-striker";
type Intent =
  | { t: "run"; n: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { t: "wide"; n: number } // n = runs RUN on top of the 1 penalty
  | { t: "nb"; mode: "bat" | "bye" | "leg_bye"; n: number }
  | { t: "bye"; n: number }
  | { t: "lb"; n: number }
  | {
      t: "out";
      kind: DismissalType;
      delivery: DeliveryKind;
      runs: number;
      credit: RunsCredit;
      who: Who;
      crossed: boolean;
    }
  | { t: "retire"; who: Who }
  | { t: "bowler"; to: SeatRef }
  | { t: "fill" };

interface Book {
  cfg: MatchCfg;
  order: SeatRef[]; // batting order
  nextIdx: number;
  retired: SeatRef[]; // retired hurt, may come back
  striker: SeatRef | null;
  nonStriker: SeatRef | null;
  bowler: SeatRef | null;
  prevOverBowler: SeatRef | null;
  total: number;
  wickets: number;
  legal: number;
  extras: { wides: number; noBalls: number; byes: number; legByes: number };
  freeHit: boolean;
  needBowler: boolean;
  bat: Record<string, { runs: number; balls: number }>;
  bowl: Record<string, { balls: number; runs: number; wkts: number }>;
  overBuckets: Record<string, { balls: number; runs: number }>;
  ended: null | "all_out" | "overs_finished" | "target_achieved";
}

const keyOf = (p: SeatRef) => (p.athleteId ? `id:${p.athleteId}` : `name:${p.name!.toLowerCase()}`);
const seatId = (p: SeatRef | null | undefined) =>
  p && (p.athleteId || p.name) ? (p.athleteId ?? `n:${p.name}`) : null;
const BOWLER_GETS_IT: DismissalType[] = ["bowled", "caught", "lbw", "stumped", "hit_wicket"];

function newBook(cfg: MatchCfg, order: SeatRef[]): Book {
  return {
    cfg,
    order,
    nextIdx: 2,
    retired: [],
    striker: order[0],
    nonStriker: order[1],
    bowler: null,
    prevOverBowler: null,
    total: 0,
    wickets: 0,
    legal: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
    freeHit: false,
    needBowler: false,
    bat: {},
    bowl: {},
    overBuckets: {},
    ended: null,
  };
}

function nextBatter(b: Book): SeatRef | null {
  if (b.nextIdx < b.order.length) return b.order[b.nextIdx];
  return b.retired[0] ?? null;
}

const isBall = (it: Intent) => it.t !== "bowler" && it.t !== "fill";

/** Write one intent into the book. */
function writeBook(b: Book, it: Intent): void {
  if (it.t === "bowler") {
    b.bowler = it.to;
    return;
  }
  if (it.t === "fill") {
    const nb = nextBatter(b)!;
    if (b.nextIdx < b.order.length) b.nextIdx += 1;
    else b.retired.shift();
    if (!b.striker) b.striker = nb;
    else b.nonStriker = nb;
    return;
  }

  const S = b.striker!;
  const N = b.nonStriker!;
  const B = b.bowler!;
  const bat = (b.bat[keyOf(S)] ??= { runs: 0, balls: 0 });
  b.bat[keyOf(N)] ??= { runs: 0, balls: 0 };
  const bowl = (b.bowl[keyOf(B)] ??= { balls: 0, runs: 0, wkts: 0 });
  const bucket = (b.overBuckets[`${keyOf(B)}|${Math.floor(b.legal / 6)}`] ??= { balls: 0, runs: 0 });
  const charge = (n: number) => {
    bowl.runs += n;
    bucket.runs += n;
  };

  let ran = 0; // runs the batters physically ran
  let delivery = "legal" as "legal" | "wide" | "nb" | "none";
  let outWho: SeatRef | null = null;
  let noSwap = false;
  let crossed = false;

  const playDelivery = (d: DeliveryKind, runs: number, credit: RunsCredit) => {
    ran = runs;
    if (d === "wide") {
      delivery = "wide";
      b.total += 1 + runs;
      b.extras.wides += 1 + runs;
      charge(1 + runs);
      return;
    }
    bat.balls += 1;
    if (d === "no_ball") {
      delivery = "nb";
      b.total += 1 + runs;
      b.extras.noBalls += 1;
      if (credit === "bat") {
        bat.runs += runs;
        charge(1 + runs);
      } else {
        if (credit === "bye") b.extras.byes += runs;
        else b.extras.legByes += runs;
        charge(1);
      }
      return;
    }
    b.total += runs;
    if (credit === "bat") {
      bat.runs += runs;
      charge(runs);
    } else if (credit === "bye") b.extras.byes += runs;
    else b.extras.legByes += runs;
  };

  switch (it.t) {
    case "run":
      playDelivery("legal", it.n, "bat");
      break;
    case "wide":
      playDelivery("wide", it.n, "bat");
      break;
    case "nb":
      playDelivery("no_ball", it.n, it.mode);
      break;
    case "bye":
      playDelivery("legal", it.n, "bye");
      break;
    case "lb":
      playDelivery("legal", it.n, "leg_bye");
      break;
    case "retire":
      delivery = "none";
      outWho = it.who === "striker" ? S : N;
      b.retired.push(outWho);
      break;
    case "out": {
      // only a run out / obstructing / retiring / timed out can be the non-striker
      const either = ["run_out", "obstructing_field", "retired_out", "timed_out"].includes(it.kind);
      outWho = either && it.who === "non-striker" ? N : S;
      b.wickets += 1;
      if (it.kind === "retired_out" || it.kind === "timed_out") {
        delivery = "none";
        break;
      }
      const runs = it.kind === "run_out" || it.kind === "obstructing_field" ? it.runs : 0;
      playDelivery(it.delivery, runs, runs > 0 ? it.credit : "bat");
      if (BOWLER_GETS_IT.includes(it.kind)) bowl.wkts += 1;
      if (it.kind === "caught") noSwap = true; // new batter always takes strike
      crossed = it.kind === "run_out" && it.crossed;
      break;
    }
  }

  // ends
  let striker: SeatRef | null = S;
  let nonStriker: SeatRef | null = N;
  if (!noSwap && ran % 2 === 1) [striker, nonStriker] = [nonStriker, striker];
  if (delivery === "legal") {
    b.legal += 1;
    bowl.balls += 1;
    bucket.balls += 1;
    if (b.legal % 6 === 0) {
      [striker, nonStriker] = [nonStriker, striker];
      b.needBowler = true;
      b.prevOverBowler = B;
    } else b.needBowler = false;
  } else if (delivery !== "none") b.needBowler = false;
  if (outWho) {
    if (striker === outWho) striker = null;
    else nonStriker = null;
  }
  // run out after crossing: the batter who is left has changed ends
  if (crossed) [striker, nonStriker] = [nonStriker, striker];
  b.striker = striker;
  b.nonStriker = nonStriker;

  // free hit: the ball after a no-ball, kept while that ball is a wide
  if (delivery === "nb") b.freeHit = true;
  else if (delivery === "legal") b.freeHit = false;

  if (b.wickets >= b.cfg.maxWickets) b.ended = "all_out";
  else if (b.legal >= b.cfg.totalOvers * 6) b.ended = "overs_finished";
  else if (b.cfg.target != null && b.total >= b.cfg.target) b.ended = "target_achieved";
}

/* ================================================================
 * 3. Doing an intent on the scorer, the way a thumb would.
 * ================================================================ */

function doOnScorer(s: Scorer, b: Book, it: Intent, fielders: SeatRef[]): void {
  switch (it.t) {
    case "bowler":
      s.pick("bowler", it.to);
      return;
    case "fill": {
      const role = pickerState(s.lineup, s.state(), false).incomingBatterRole;
      expect(role, "the screen must ask for the empty seat").toBe(
        b.striker ? "nonStriker" : "striker",
      );
      s.pick(role!, nextBatter(b)!);
      return;
    }
    case "run":
      s.tap(ballHelpers.run(it.n));
      return;
    case "wide":
      // one tap = wide +1; the bubble adds the runs that were run
      s.tap(it.n === 0 ? ballHelpers.wide(1) : extraDeliveryInput("Wide", "bat", it.n));
      return;
    case "nb":
      s.tap(it.n === 0 ? ballHelpers.noBall(0, 0) : extraDeliveryInput("No Ball", it.mode, it.n));
      return;
    case "bye":
      s.tap(ballHelpers.bye(it.n));
      return;
    case "lb":
      s.tap(ballHelpers.legBye(it.n));
      return;
    case "retire":
      s.wicket({
        partial: buildWicketBall({ kind: "retired_hurt", delivery: "legal", runs: 0, credit: "bat" }),
        dismissed: it.who,
        fielder: null,
        crossed: false,
      });
      return;
    case "out": {
      // the sheet only offers deliveries the laws allow
      if (!isNonDeliveryKind(it.kind)) {
        expect(deliveriesAllowedFor(it.kind, s.state().innings.freeHit)).toContain(it.delivery);
      }
      s.wicket({
        partial: buildWicketBall({
          kind: it.kind,
          delivery: it.delivery,
          runs: takesRuns(it.kind) ? it.runs : 0,
          credit: it.credit,
        }),
        dismissed: canChooseWhoIsOut(it.kind) ? it.who : "striker",
        fielder: needsFielder(it.kind) ? fielders[0] : null,
        crossed: it.kind === "run_out" && it.crossed,
      });
      return;
    }
  }
}

/* ================================================================
 * 4. The check that runs after every ball.
 * ================================================================ */

let ballsChecked = 0;

function check(s: Scorer, b: Book, opts: { unsavedPicks?: boolean } = {}): void {
  ballsChecked += 1;
  const st = s.state();
  const stats = s.stats();
  const where = `after ball ${s.events.length} (${st.innings.overDisplay})`;

  // total = sum of the balls, everywhere it is shown
  const sum = s.events.reduce((n, e) => n + totalRunsForBall(e), 0);
  expect(st.innings.runs, `total ${where}`).toBe(b.total);
  expect(stats.team.runs, `scorecard total ${where}`).toBe(b.total);
  expect(sum, `sum of balls ${where}`).toBe(b.total);
  expect(st.innings.wickets, `wickets ${where}`).toBe(b.wickets);
  expect(stats.team.wickets, `scorecard wickets ${where}`).toBe(b.wickets);
  expect(stats.team.fallOfWickets.length, `fall of wickets ${where}`).toBe(b.wickets);

  // overs
  expect(st.innings.legalBalls, `legal balls ${where}`).toBe(b.legal);
  expect(st.innings.overDisplay, `overs ${where}`).toBe(`${Math.floor(b.legal / 6)}.${b.legal % 6}`);
  expect(stats.team.legalBalls).toBe(b.legal);
  expect(formatOversCompact(stats.team.legalBalls)).toBe(
    b.legal % 6 === 0 ? String(b.legal / 6) : `${Math.floor(b.legal / 6)}.${b.legal % 6}`,
  );
  const label = formatLiveOver(b.legal, { preOver: st.innings.awaitingNewBowler });
  if (b.legal === 0) expect(label).toBe("Over 1");
  else if (b.legal % 6 === 0 && b.needBowler && !b.ended)
    expect(label, `header over label ${where}`).toBe(`Over ${b.legal / 6 + 1}`);
  else
    expect(label, `header over label ${where}`).toBe(
      `${Math.floor((b.legal - 1) / 6) + 1}.${((b.legal - 1) % 6) + 1}`,
    );
  // every over in the history has at most 6 legal balls and its chips add up
  const history = computeOverHistory(s.events, () => "x");
  for (const row of history) expect(row.legalBalls).toBeLessThanOrEqual(6);
  expect(history.reduce((n, r) => n + r.runs, 0)).toBe(b.total);
  expect(history.reduce((n, r) => n + r.chips.length, 0)).toBe(s.events.length);

  // extras add up
  const ex = stats.team.extras;
  expect(
    { wides: ex.wides, noBalls: ex.noBalls, byes: ex.byes, legByes: ex.legByes },
    `extras ${where}`,
  ).toEqual(b.extras);
  expect(ex.total).toBe(ex.wides + ex.noBalls + ex.byes + ex.legByes + ex.penalty);

  // batters
  let batRuns = 0;
  for (const [k, want] of Object.entries(b.bat)) {
    const row = stats.batting.byKey.get(k);
    expect({ runs: row?.runs ?? 0, balls: row?.balls ?? 0 }, `batter ${k} ${where}`).toEqual(want);
    batRuns += want.runs;
  }
  expect(stats.batting.byKey.size, `batters listed ${where}`).toBe(Object.keys(b.bat).length);
  expect(batRuns + ex.total, `batters + extras = total ${where}`).toBe(b.total);

  // bowlers
  let bowlBalls = 0;
  for (const [k, want] of Object.entries(b.bowl)) {
    const row = stats.bowling.byKey.get(k);
    const maidens = Object.entries(b.overBuckets).filter(
      ([bk, v]) => bk.startsWith(`${k}|`) && v.balls === 6 && v.runs === 0,
    ).length;
    expect(
      {
        balls: row?.legalBalls ?? 0,
        runs: row?.runsConceded ?? 0,
        wkts: row?.wickets ?? 0,
        maidens: row?.maidens ?? 0,
      },
      `bowler ${k} ${where}`,
    ).toEqual({ ...want, maidens });
    expect(st.innings.bowlerLegalBalls.get(k) ?? 0).toBe(want.balls);
    bowlBalls += want.balls;
  }
  expect(bowlBalls, `bowlers' balls = innings balls ${where}`).toBe(b.legal);
  // every run is either charged to a bowler or is a bye / leg bye
  const charged = Object.values(b.bowl).reduce((n, r) => n + r.runs, 0);
  expect(charged + ex.byes + ex.legByes + ex.penalty).toBe(b.total);

  // who is where on the screen
  expect(seatId(s.lineup.striker), `striker ${where}`).toBe(seatId(b.striker));
  expect(seatId(s.lineup.nonStriker), `non-striker ${where}`).toBe(seatId(b.nonStriker));

  // end of innings
  expect(st.inningsShouldEnd, `innings end ${where}`).toBe(b.ended);
  if (b.ended) return;

  expect(st.innings.freeHit, `free hit ${where}`).toBe(b.freeHit);
  // The two flags the phone screen reads to open a picker by itself. A flag
  // stuck at "true" is what made a re-opened match ask "Select striker".
  expect(st.innings.awaitingNewBowler, `"new bowler" flag ${where}`).toBe(b.needBowler);
  if (!opts.unsavedPicks)
    expect(st.innings.awaitingNewBatter, `"new batter" flag ${where}`).toBe(
      !b.striker || !b.nonStriker,
    );
  if (opts.unsavedPicks) return; // right after an undo the screen holds picks no saved ball proves

  // ---- close the scorer and open it again ----
  const re = s.reopened();
  expect(re.state().innings.runs).toBe(b.total);
  expect(seatId(re.lineup.striker), `re-open striker ${where}`).toBe(seatId(b.striker));
  expect(seatId(re.lineup.nonStriker), `re-open non-striker ${where}`).toBe(seatId(b.nonStriker));
  const ask = pickerState(re.lineup, re.state(), true);
  // it asks for a batter ONLY when a seat is really empty
  expect(ask.incomingBatterRole, `re-open asks for batter ${where}`).toBe(
    !b.striker ? "striker" : !b.nonStriker ? "nonStriker" : null,
  );
  // it asks for a bowler ONLY when the over has just ended
  expect(ask.bowlerPickerNeededForBall, `re-open asks for bowler ${where}`).toBe(b.needBowler);
  if (!b.needBowler) expect(seatId(re.lineup.bowler)).toBe(seatId(b.bowler));
  // and the open screen agrees with the re-opened one
  const live = pickerState(s.lineup, st, true);
  expect(live.incomingBatterRole, `live vs re-open batter picker ${where}`).toBe(
    ask.incomingBatterRole,
  );
  // (a new bowler tapped before a batter retired is a pick no saved ball proves yet)
  const pickedNewBowler = seatId(s.lineup.bowler) !== seatId(b.prevOverBowler);
  expect(live.newBowlerStillNeeded).toBe(b.needBowler && !pickedNewBowler);
}

/* ================================================================
 * 5. Playing an innings: scripted balls first (every kind of event),
 *    then seeded random balls until the innings ends.
 * ================================================================ */

function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Weights {
  wicket: number; // chance of a wicket ball, 0..1
  big: number; // chance of a four or six, 0..1
  retire: number;
}

interface InningsRun {
  scorer: Scorer;
  book: Book;
  log: { it: Intent; eventIndex: number | null }[];
  seen: Set<string>;
  undone: number;
  fixed: number;
}

function quota(cfg: MatchCfg) {
  return Math.ceil(cfg.totalOvers / 5) * 6;
}

function pickBowler(b: Book, bowlers: SeatRef[], rnd: () => number): SeatRef {
  const ok = bowlers.filter(
    (p) =>
      seatId(p) !== seatId(b.bowler) &&
      seatId(p) !== seatId(b.prevOverBowler) &&
      (b.bowl[keyOf(p)]?.balls ?? 0) + 6 <= quota(b.cfg),
  );
  expect(ok.length, "a bowler with overs left").toBeGreaterThan(0);
  const least = Math.min(...ok.map((p) => b.bowl[keyOf(p)]?.balls ?? 0));
  const pool = ok.filter((p) => (b.bowl[keyOf(p)]?.balls ?? 0) === least);
  return pool[Math.floor(rnd() * pool.length)];
}

function randomBall(b: Book, rnd: () => number, w: Weights, retiresLeft: number): Intent {
  const r = rnd();
  const who: Who = rnd() < 0.5 ? "striker" : "non-striker";
  if (r < w.wicket) {
    const d = rnd();
    if (b.freeHit) {
      // only a run out (or obstructing) is possible on a free hit
      return {
        t: "out",
        kind: rnd() < 0.8 ? "run_out" : "obstructing_field",
        delivery: d < 0.7 ? "legal" : d < 0.85 ? "wide" : "no_ball",
        runs: Math.floor(rnd() * 3),
        credit: rnd() < 0.7 ? "bat" : rnd() < 0.5 ? "bye" : "leg_bye",
        who,
        crossed: rnd() < 0.5,
      };
    }
    const delivery: DeliveryKind = d < 0.8 ? "legal" : d < 0.9 ? "wide" : "no_ball";
    const kinds: DismissalType[] =
      delivery === "legal"
        ? ["bowled", "caught", "caught", "lbw", "stumped", "hit_wicket", "run_out", "run_out"]
        : delivery === "wide"
          ? ["stumped", "run_out", "hit_wicket", "obstructing_field"]
          : ["run_out", "obstructing_field", "hit_ball_twice"];
    return {
      t: "out",
      kind: kinds[Math.floor(rnd() * kinds.length)],
      delivery,
      runs: Math.floor(rnd() * 3),
      credit: delivery === "wide" || rnd() < 0.7 ? "bat" : rnd() < 0.5 ? "bye" : "leg_bye",
      who,
      crossed: rnd() < 0.5,
    };
  }
  if (r < w.wicket + w.retire && retiresLeft > 0 && b.nextIdx < b.order.length)
    return { t: "retire", who };
  const x = rnd();
  if (x < 0.06) return { t: "wide", n: rnd() < 0.6 ? 0 : rnd() < 0.8 ? 1 : rnd() < 0.5 ? 2 : 4 };
  if (x < 0.11) {
    const m = rnd();
    return {
      t: "nb",
      mode: m < 0.6 ? "bat" : m < 0.8 ? "bye" : "leg_bye",
      n: rnd() < 0.4 ? 0 : ([1, 2, 3, 4, 6] as const)[Math.floor(rnd() * 5)],
    };
  }
  if (x < 0.14) return { t: "bye", n: 1 + Math.floor(rnd() * 4) };
  if (x < 0.18) return { t: "lb", n: 1 + Math.floor(rnd() * 4) };
  if (rnd() < w.big) return { t: "run", n: rnd() < 0.65 ? 4 : 6 };
  const y = rnd();
  return { t: "run", n: y < 0.42 ? 0 : y < 0.8 ? 1 : y < 0.93 ? 2 : y < 0.97 ? 3 : 5 };
}

async function playInnings(a: {
  cfg: MatchCfg;
  batters: SeatRef[];
  bowlers: SeatRef[];
  script: Intent[];
  seed: number;
  weights: Weights;
  /** Undo / redo a few balls now and then. */
  undoRedo?: boolean;
  /** "Wrong ball?" on an earlier ball now and then. */
  fixes?: boolean;
}): Promise<InningsRun> {
  const rnd = rngFrom(a.seed);
  const s = new Scorer(a.cfg);
  let b = newBook(a.cfg, a.batters);
  const run: InningsRun = { scorer: s, book: b, log: [], seen: new Set(), undone: 0, fixed: 0 };
  // book as it stood before / after each saved ball (by ball index)
  let before: Book[] = [];
  let after: Book[] = [];
  const script = [...a.script];
  let retiresLeft = 2;

  // opening pair walks out
  s.pick("striker", a.batters[0]);
  s.pick("nonStriker", a.batters[1]);

  const doIntent = (it: Intent) => {
    const eventIndex = isBall(it) ? s.events.length : null;
    if (eventIndex != null) before[eventIndex] = structuredClone(b);
    doOnScorer(s, b, it, a.bowlers);
    writeBook(b, it);
    run.log.push({ it, eventIndex });
    if (eventIndex != null) {
      after[eventIndex] = structuredClone(b);
      run.seen.add(
        it.t === "out"
          ? `out:${it.kind}:${it.delivery}`
          : it.t === "nb"
            ? `nb:${it.mode}`
            : it.t === "wide"
              ? `wide:${it.n > 0 ? "runs" : "plain"}`
              : it.t,
      );
      expect(s.events.length, "exactly one ball saved per tap").toBe(eventIndex + 1);
      try {
        check(s, b);
      } catch (e) {
        (e as Error).message +=
          `\n  seed ${a.seed}, last balls: ${JSON.stringify(run.log.slice(-6).map((r) => r.it))}` +
          `\n  saved: ${JSON.stringify(s.events.slice(-4).map((x) => [x.striker_name, x.non_striker_name, x.runs_off_bat, x.extra_type, x.extra_runs, x.dismissal_type, x.dismissed_name]))}`;
        throw e;
      }
    }
  };

  /** Rebuild the book from the whole log (after a "Wrong ball?" fix). */
  const refold = () => {
    const nb = newBook(a.cfg, a.batters);
    before = [];
    after = [];
    let kept = 0;
    for (const row of run.log) {
      if (nb.ended) break; // the fix ended the innings earlier: later balls never happen
      if (row.eventIndex != null) before[row.eventIndex] = structuredClone(nb);
      writeBook(nb, row.it);
      if (row.eventIndex != null) after[row.eventIndex] = structuredClone(nb);
      kept += 1;
    }
    run.log.length = kept;
    return nb;
  };

  let guard = 0;
  while (!b.ended) {
    expect((guard += 1), "innings must end").toBeLessThan(2000);

    // someone missing? the scorer picks before the next ball
    if (!b.striker || !b.nonStriker) {
      doIntent({ t: "fill" });
      continue;
    }
    const next = script[0];
    const overdue = b.bowler && (b.bowl[keyOf(b.bowler)]?.balls ?? 0) >= quota(a.cfg);
    const sameAsLastOver = b.needBowler && seatId(b.bowler) === seatId(b.prevOverBowler);
    if ((!b.bowler || sameAsLastOver || overdue) && next?.t !== "bowler" && next?.t !== "retire") {
      doIntent({ t: "bowler", to: pickBowler(b, a.bowlers, rnd) });
      continue;
    }
    if (script.length > 0) {
      doIntent(script.shift()!);
      continue;
    }

    doIntent(randomBall(b, rnd, a.weights, retiresLeft));
    if (run.log.at(-1)!.it.t === "retire") retiresLeft -= 1;
    if (b.ended) break;

    // ---- undo a few balls, then redo them: everything must come back ----
    if (a.undoRedo && rnd() < 0.05 && s.events.length > 4) {
      const k = 1 + Math.floor(rnd() * 3);
      const top = s.events.length - 1;
      for (let i = 0; i < k; i += 1) {
        s.undo();
        check(s, before[top - i], { unsavedPicks: true });
      }
      for (let i = k - 1; i >= 0; i -= 1) {
        s.redo();
        check(s, after[top - i]);
      }
      expect(s.redoStack.length).toBe(0);
      run.undone += k;
    }

    // ---- "Wrong ball?": change a plain ball a few balls back (2 <-> 4, 0 -> 2) ----
    if (a.fixes && rnd() < 0.1 && s.events.length > 12) {
      const idx = s.events.length - 2 - Math.floor(rnd() * 8);
      const row = run.log.find((r) => r.eventIndex === idx)!;
      if (row.it.t === "run" && (row.it.n === 0 || row.it.n === 2 || row.it.n === 4)) {
        const n = row.it.n === 4 ? 2 : ((row.it.n + 2) as 2 | 4);
        const error = await s.fixBall(idx, ballHelpers.run(n));
        row.it = { t: "run", n };
        b = refold();
        // In a chase the corrected ball can win the match early: the later balls
        // are then rightly refused. Otherwise every later ball must go back.
        if (error) {
          expect(b.ended, `unexpected: ${error}`).not.toBeNull();
          expect(error).toMatch(/conclusion|complete/i);
        }
        run.book = b;
        check(s, b);
        run.fixed += 1;
      }
    }
  }
  run.book = b;
  return run;
}

/* ================================================================
 * 6. The matches
 * ================================================================ */

const squad = (prefix: string, n: number, withIds: boolean): SeatRef[] =>
  Array.from({ length: n }, (_, i) => ({
    athleteId: withIds ? `${prefix.toLowerCase()}-${i + 1}` : null,
    name: `${prefix} ${i + 1}`,
  }));

const out = (
  kind: DismissalType,
  o: Partial<Extract<Intent, { t: "out" }>> = {},
): Intent => ({
  t: "out",
  kind,
  delivery: "legal",
  runs: 0,
  credit: "bat",
  who: "striker",
  crossed: false,
  ...o,
});

function inningsRow(n: number, r: InningsRun, batting: string, bowling: string): InningsRow {
  const st = r.scorer.stats();
  return {
    id: r.scorer.cfg.inningsId,
    innings_number: n,
    batting_team_id: batting,
    bowling_team_id: bowling,
    runs: st.team.runs,
    wickets: st.team.wickets,
    balls: st.team.legalBalls % 6,
    overs: Math.floor(st.team.legalBalls / 6),
    target: r.scorer.cfg.target,
    status: "completed",
  } as unknown as InningsRow;
}

describe("whole match: T20, 11 a side", () => {
  it("plays both innings, every kind of ball, and the chase is won", async () => {
    const A = squad("Lion", 11, true);
    const B = squad("Tiger", 11, true);

    // Every kind of event at least once, in an order a real match could have.
    const firstScript: Intent[] = [
      { t: "run", n: 1 },
      { t: "run", n: 0 },
      { t: "wide", n: 0 },
      { t: "wide", n: 2 },
      { t: "wide", n: 1 },
      { t: "nb", mode: "bat", n: 4 },
      { t: "run", n: 6 }, // free hit
      { t: "bye", n: 1 },
      { t: "lb", n: 2 },
      { t: "run", n: 3 }, // over ends, odd runs
      out("bowled"),
      out("caught"),
      { t: "nb", mode: "bye", n: 2 },
      { t: "wide", n: 0 }, // free hit stays after a wide
      out("run_out", { runs: 1, who: "non-striker", crossed: true }), // run out ON the free hit
      { t: "nb", mode: "leg_bye", n: 1 },
      { t: "run", n: 2 },
      out("lbw"),
      { t: "retire", who: "striker" },
      { t: "run", n: 1 },
      { t: "run", n: 0 }, // over ends
      out("stumped", { delivery: "wide" }),
      out("run_out", { delivery: "no_ball", runs: 2, credit: "bat", who: "striker" }),
      out("run_out", { runs: 2, credit: "bye", who: "striker", crossed: false }),
      { t: "run", n: 4 },
      { t: "nb", mode: "bat", n: 0 },
      { t: "run", n: 1 },
    ];
    const first = await playInnings({
      cfg: { totalOvers: 20, maxWickets: wicketLimit(11), target: null, inningsId: "inn-1" },
      batters: A,
      bowlers: B.slice(0, 6),
      script: firstScript,
      seed: 11,
      weights: { wicket: 0.012, big: 0.12, retire: 0.004 },
      undoRedo: true,
      fixes: true,
    });
    expect(first.book.ended).not.toBeNull();
    expect(first.undone, "undo/redo was exercised").toBeGreaterThan(0);
    expect(first.fixed, "Wrong ball? was exercised").toBeGreaterThan(0);

    const target = first.book.total + 1;
    const secondScript: Intent[] = [
      { t: "run", n: 1 },
      out("hit_wicket"),
      { t: "run", n: 2 },
      { t: "bowler", to: B[10] }, // (unused name, replaced below)
      out("obstructing_field", { runs: 1, who: "non-striker" }),
      out("hit_ball_twice", { delivery: "no_ball" }),
      { t: "run", n: 1 },
      out("retired_out", { who: "non-striker" }),
      out("timed_out", { who: "striker" }),
      { t: "run", n: 4 },
    ];
    // the mid-over bowler change must be someone from the fielding side (A bowls now)
    secondScript[3] = { t: "bowler", to: A[5] };
    const second = await playInnings({
      cfg: { totalOvers: 20, maxWickets: wicketLimit(11), target, inningsId: "inn-2" },
      batters: B,
      bowlers: A.slice(0, 7),
      script: secondScript,
      seed: 12,
      weights: { wicket: 0, big: 0.45, retire: 0 },
      undoRedo: true,
    });
    expect(second.book.ended, "the chase is won").toBe("target_achieved");
    expect(second.book.total).toBeGreaterThanOrEqual(target);

    // nothing more can be scored once the match is decided
    expect(() => second.scorer.submit(ballHelpers.run(1))).toThrowError(/conclusion|complete/i);

    // every kind of event really happened
    const seen = new Set([...first.seen, ...second.seen]);
    for (const k of [
      "run",
      "wide:plain",
      "wide:runs",
      "nb:bat",
      "nb:bye",
      "nb:leg_bye",
      "bye",
      "lb",
      "retire",
      "out:bowled:legal",
      "out:caught:legal",
      "out:lbw:legal",
      "out:stumped:wide",
      "out:run_out:legal",
      "out:run_out:no_ball",
      "out:hit_wicket:legal",
      "out:obstructing_field:legal",
      "out:hit_ball_twice:no_ball",
      "out:retired_out:legal",
      "out:timed_out:legal",
    ])
      expect(seen.has(k), `event kind played: ${k}`).toBe(true);

    // result
    const result = detectMatchResult(
      [inningsRow(1, first, "A", "B"), inningsRow(2, second, "B", "A")],
      { teamAId: "A", teamBId: "B", wicketLimits: { A: 10, B: 10 } },
    );
    expect(result.winnerTeamId).toBe("B");
    expect(result.winningMarginType).toBe("wickets");
    expect(result.winningMargin).toBe(10 - second.book.wickets);
  });
});

describe("whole match: 8 overs, 8 a side, guest players without accounts", () => {
  it("is all out at 7 wickets, then the second innings is played to its end", async () => {
    const A = squad("Guest", 8, false); // names only, like players typed in by hand
    const B = squad("Visitor", 8, false);
    const limit = wicketLimit(8);
    expect(limit).toBe(7);

    const first = await playInnings({
      cfg: { totalOvers: 8, maxWickets: limit, target: null, inningsId: "s-1" },
      batters: A,
      bowlers: B.slice(0, 5),
      script: [{ t: "run", n: 1 }, { t: "retire", who: "non-striker" }],
      seed: 21,
      weights: { wicket: 0.3, big: 0.1, retire: 0 },
      undoRedo: true,
    });
    expect(first.book.ended, "8 a side is all out at 7 wickets").toBe("all_out");
    expect(first.book.wickets).toBe(7);
    // no more balls once all out
    expect(() => first.scorer.submit(ballHelpers.run(1))).toThrowError(BallEventError);

    const second = await playInnings({
      cfg: { totalOvers: 8, maxWickets: limit, target: first.book.total + 1, inningsId: "s-2" },
      batters: B,
      bowlers: A.slice(0, 5),
      script: [],
      seed: 22,
      weights: { wicket: 0.05, big: 0.1, retire: 0.01 },
      undoRedo: true,
      fixes: true,
    });
    expect(second.book.ended).not.toBeNull();

    const result = detectMatchResult(
      [inningsRow(1, first, "A", "B"), inningsRow(2, second, "B", "A")],
      { teamAId: "A", teamBId: "B", wicketLimits: { A: limit, B: limit } },
    );
    if (second.book.total > first.book.total) {
      expect(result.winnerTeamId).toBe("B");
      expect(result.winningMargin).toBe(limit - second.book.wickets);
    } else if (second.book.total < first.book.total) {
      expect(result.winnerTeamId).toBe("A");
      expect(result.winningMargin).toBe(first.book.total - second.book.total);
    } else expect(result.victoryType).toBe("tied");
  });

  it("many more random matches stay correct ball by ball", async () => {
    // MATCH_SEEDS=500 npx vitest run src/lib/mc-full-match.test.ts  plays 500 more matches
    const matches = Number(process.env.MATCH_SEEDS ?? 12);
    for (let seed = 100; seed < 100 + matches; seed += 1) {
      const A = squad("P", 8, seed % 2 === 0);
      const B = squad("Q", 8, seed % 2 === 0);
      const first = await playInnings({
        cfg: { totalOvers: 6, maxWickets: 7, target: null, inningsId: `r-${seed}-1` },
        batters: A,
        bowlers: B.slice(0, 5),
        script: [],
        seed,
        weights: { wicket: 0.09, big: 0.15, retire: 0.02 },
        undoRedo: true,
        fixes: true,
      });
      await playInnings({
        cfg: {
          totalOvers: 6,
          maxWickets: 7,
          target: first.book.total + 1,
          inningsId: `r-${seed}-2`,
        },
        batters: B,
        bowlers: A.slice(0, 5),
        script: [],
        seed: seed + 500,
        weights: { wicket: 0.07, big: 0.2, retire: 0.02 },
        undoRedo: true,
        fixes: true,
      });
    }
    expect(ballsChecked).toBeGreaterThan(1000);
  }, 600_000);
});

/* ================================================================
 * 7. Named regressions: one per bug found by the audit.
 * ================================================================ */

function freshT20(): { s: Scorer; A: SeatRef[]; B: SeatRef[] } {
  const A = squad("Lion", 11, true);
  const B = squad("Tiger", 11, true);
  const s = new Scorer({ totalOvers: 20, maxWickets: 10, target: null, inningsId: "x" });
  s.pick("striker", A[0]);
  s.pick("nonStriker", A[1]);
  s.pick("bowler", B[0]);
  return { s, A, B };
}

const retire = (s: Scorer, who: Who) =>
  s.wicket({
    partial: buildWicketBall({ kind: "retired_hurt", delivery: "legal", runs: 0, credit: "bat" }),
    dismissed: who,
    fielder: null,
    crossed: false,
  });

describe("scorer regressions found by the whole-match audit", () => {
  it("re-opening after a wicket and one more ball asks for nobody (f0959479)", () => {
    const { s, A, B } = freshT20();
    s.tap(ballHelpers.run(1));
    s.wicket({ partial: buildWicketBall({ kind: "bowled", delivery: "legal", runs: 0, credit: "bat" }), dismissed: "striker", fielder: null, crossed: false });
    s.pick("striker", A[2]);
    s.tap(ballHelpers.run(0));
    const re = s.reopened();
    const ask = pickerState(re.lineup, re.state(), true);
    expect(ask.requiredPicker).toBeNull();
    expect(ask.mustPickBeforeBall).toBe(false);
    expect(re.lineup.bowler.athleteId).toBe(B[0].athleteId);
  });

  it("re-opening right after a batter retired hurt does not put that batter back", () => {
    const { s, A } = freshT20();
    s.tap(ballHelpers.run(1)); // Lion 2 on strike
    retire(s, "striker");
    expect(isEmptySeat(s.lineup.striker)).toBe(true);
    const re = s.reopened();
    expect(isEmptySeat(re.lineup.striker), "retired batter must not be re-seated").toBe(true);
    expect(pickerState(re.lineup, re.state(), true).requiredPicker).toBe("striker");
    // the scorer cannot record a ball for the retired batter by mistake
    expect(() => re.tap(ballHelpers.run(1))).toThrowError(/pick first/);
    re.pick("striker", A[2]);
    re.tap(ballHelpers.run(1));
    expect(re.stats().batting.byKey.get(`id:${A[2].athleteId}`)?.runs).toBe(1);
  });

  it("a batter can retire between two overs, and the new bowler is still asked for", () => {
    const { s, A, B } = freshT20();
    for (let i = 0; i < 6; i += 1) s.tap(ballHelpers.run(0));
    expect(s.state().innings.awaitingNewBowler).toBe(true);
    // before the fix this threw "The same bowler cannot bowl consecutive overs"
    retire(s, "non-striker");
    expect(s.state().innings.awaitingNewBowler, "retiring is not a ball of the new over").toBe(true);
    expect(pickerState(s.lineup, s.state(), true).newBowlerStillNeeded).toBe(true);
    // the same bowler is still refused for the new over
    s.pick("nonStriker", A[2]);
    expect(() => s.submit(ballHelpers.run(1))).toThrowError(/consecutive/);
    s.pick("bowler", B[1]);
    s.tap(ballHelpers.run(1));
    // the over in the history belongs to the bowler who bowled it
    expect(computeOverHistory(s.events, () => "x")[1].bowler).toBe(B[1].name);
    expect(s.stats().bowling.byKey.get(`id:${B[0].athleteId}`)?.maidens).toBe(1);
  });

  it("a batter can retire after a re-open at the end of an over (no bowler seated yet)", () => {
    const { s } = freshT20();
    for (let i = 0; i < 6; i += 1) s.tap(ballHelpers.run(0));
    const re = s.reopened();
    expect(isEmptySeat(re.lineup.bowler)).toBe(true);
    expect(() => retire(re, "striker")).not.toThrow();
    expect(re.state().innings.wickets).toBe(0);
  });

  it("retiring is not a ball faced, and a returning batter is not shown as retired", () => {
    const { s, A } = freshT20();
    s.tap(ballHelpers.run(1)); // Lion 1: 1 off 1. Lion 2 on strike
    retire(s, "non-striker"); // Lion 1 retires hurt
    const l1 = `id:${A[0].athleteId}`;
    const l2 = `id:${A[1].athleteId}`;
    expect(s.stats().batting.byKey.get(l2)?.balls, "striker did not face a ball").toBe(0);
    expect(s.stats().batting.byKey.get(l1)?.dismissalType).toBe("retired_hurt");
    s.pick("nonStriker", A[2]);
    s.wicket({ partial: buildWicketBall({ kind: "bowled", delivery: "legal", runs: 0, credit: "bat" }), dismissed: "striker", fielder: null, crossed: false });
    s.pick("striker", A[0]); // Lion 1 comes back
    s.tap(ballHelpers.run(4));
    let row = s.stats().batting.byKey.get(l1)!;
    expect(row.notOut).toBe(true);
    expect(row.dismissalType).toBeNull();
    expect(row.runs).toBe(5);
    s.wicket({ partial: buildWicketBall({ kind: "lbw", delivery: "legal", runs: 0, credit: "bat" }), dismissed: "striker", fielder: null, crossed: false });
    row = s.stats().batting.byKey.get(l1)!;
    expect(row.dismissalType, "a later real dismissal is recorded").toBe("lbw");
  });

  it("redo works across a wicket and across an over change", () => {
    const { s, A, B } = freshT20();
    for (let i = 0; i < 5; i += 1) s.tap(ballHelpers.run(0));
    s.wicket({ partial: buildWicketBall({ kind: "bowled", delivery: "legal", runs: 0, credit: "bat" }), dismissed: "striker", fielder: null, crossed: false }); // 6th ball
    s.pick("nonStriker", A[2]);
    s.pick("bowler", B[1]);
    s.tap(ballHelpers.run(1));
    s.tap(ballHelpers.run(2));
    const total = s.state().innings.runs;
    s.undo();
    s.undo();
    s.undo(); // the wicket ball too
    expect(s.state().innings.wickets).toBe(0);
    s.redo();
    s.redo(); // before the fix: "Select the striker" / "consecutive overs"
    s.redo();
    expect(s.state().innings.runs).toBe(total);
    expect(s.state().innings.wickets).toBe(1);
    expect(s.events.at(-1)?.bowler_athlete_id).toBe(B[1].athleteId);
    expect(s.events.at(-1)?.over_number).toBe(1);
  });

  it("run out after the batters crossed: the right end stays empty after undo, redo and a re-open", () => {
    const { s, A } = freshT20();
    s.tap(ballHelpers.run(0));
    const runOut = () =>
      s.wicket({
        partial: buildWicketBall({ kind: "run_out", delivery: "legal", runs: 0, credit: "bat" }),
        dismissed: "non-striker",
        fielder: null,
        crossed: true,
      });
    runOut();
    // Lion 2 (non-striker) is out; Lion 1 crossed, so he is now at the other end
    const expectCrossed = (x: Scorer, how: string) => {
      expect(isEmptySeat(x.lineup.striker), `${how}: new batter takes strike`).toBe(true);
      expect(x.lineup.nonStriker.athleteId, how).toBe(A[0].athleteId);
      expect(pickerState(x.lineup, x.state(), true).requiredPicker, how).toBe("striker");
    };
    expectCrossed(s, "live");
    expectCrossed(s.reopened(), "re-opened"); // before: the choice was forgotten
    s.undo();
    s.redo();
    expectCrossed(s, "after undo + redo"); // before: the choice was forgotten
    s.pick("striker", A[2]);
    s.tap(ballHelpers.run(1));
    expect(s.events.at(-1)?.striker_athlete_id).toBe(A[2].athleteId);
  });

  it("a free hit that is called wide offers no stumping", () => {
    expect(deliveriesAllowedFor("stumped", true)).toEqual([]);
    expect(deliveriesAllowedFor("stumped", false)).toEqual(["legal", "wide"]);
    expect(deliveriesAllowedFor("run_out", true)).toEqual(["legal", "wide", "no_ball"]);
    const { s } = freshT20();
    s.tap(ballHelpers.noBall(0, 0));
    expect(s.state().innings.freeHit).toBe(true);
    expect(() =>
      s.wicket({ partial: buildWicketBall({ kind: "bowled", delivery: "legal", runs: 0, credit: "bat" }), dismissed: "striker", fielder: null, crossed: false }),
    ).toThrowError(/free hit/);
    expect(s.events.length, "the refused wicket saved nothing").toBe(1);
  });

  it("bowler rules: no two overs in a row, no more than a fifth of the overs", () => {
    const { s, B } = freshT20();
    const over = (bowler: SeatRef) => {
      s.pick("bowler", bowler);
      for (let i = 0; i < 6; i += 1) s.tap(ballHelpers.run(0));
    };
    over(B[0]);
    expect(() => s.tap(ballHelpers.run(0))).toThrowError(/pick first: bowler/);
    for (let i = 0; i < 3; i += 1) {
      over(B[1]);
      over(B[0]);
    }
    over(B[1]); // B[0] has 4 overs, B[1] has 4 overs
    s.pick("bowler", B[0]);
    expect(() => s.submit(ballHelpers.run(0))).toThrowError(/maximum of 4 overs/);
    s.pick("bowler", B[2]);
    s.tap(ballHelpers.run(0));
    expect(s.state().innings.overDisplay).toBe("8.1");
  });

  it("\"Wrong ball?\" that moves the strike (1 becomes 2) carries the move to the later balls", async () => {
    const A = squad("Lion", 11, true);
    const B = squad("Tiger", 11, true);
    const cfg = { totalOvers: 20, maxWickets: 10, target: null, inningsId: "fix" };
    const script: Intent[] = [
      { t: "bowler", to: B[0] },
      { t: "run", n: 1 },
      { t: "run", n: 0 },
      { t: "run", n: 1 },
      { t: "run", n: 2 },
      { t: "run", n: 0 },
      { t: "run", n: 4 },
      { t: "bowler", to: B[1] },
      { t: "run", n: 1 },
      { t: "wide", n: 0 },
      { t: "run", n: 6 },
    ];
    const s = new Scorer(cfg);
    s.pick("striker", A[0]);
    s.pick("nonStriker", A[1]);
    for (const it of script) doOnScorer(s, newBook(cfg, A), it, B);
    expect(await s.fixBall(0, ballHelpers.run(2))).toBeNull();
    const book = newBook(cfg, A);
    script[1] = { t: "run", n: 2 };
    for (const it of script) writeBook(book, it);
    check(s, book);
  });

  it("a ball is saved again with the same data when the internet drops, and gives up cleanly", async () => {
    const net = () => Object.assign(new Error("Failed to fetch"), { retryable: true });
    let calls = 0;
    const waits: number[] = [];
    const ok = await saveWithRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw net();
        return "saved";
      },
      { wait: async (ms) => void waits.push(ms) },
    );
    expect(ok).toBe("saved");
    expect(calls).toBe(3);
    expect(waits).toEqual([1500, 3000]);

    // the database refusing the row is never retried
    calls = 0;
    await expect(
      saveWithRetry(
        async () => {
          calls += 1;
          throw Object.assign(new Error("duplicate key"), { retryable: false });
        },
        { wait: async () => {} },
      ),
    ).rejects.toThrow("duplicate key");
    expect(calls).toBe(1);

    // still offline after every try: it stops, it does not loop for ever
    calls = 0;
    await expect(
      saveWithRetry(
        async () => {
          calls += 1;
          throw net();
        },
        { wait: async () => {} },
      ),
    ).rejects.toThrow("Failed to fetch");
    expect(calls).toBe(6);
  });
});
