import { useCallback, useMemo, useRef, useState } from "react";
import type { Database } from "@/integrations/supabase/types";
import {
  countsAsBall,
  nextPosition,
  type AppendBallInput,
  type CreateInningsInput,
  type MCBallEvent,
  type MCInnings,
} from "@/lib/mc-ball-events";
import { replayInnings, type MatchState } from "@/lib/mc-rules-engine";
import { lineupBeforeBall, prepareBall, resumeLineup } from "@/lib/mc-scoring-core";
import { wicketLimitForTeam } from "@/lib/mc-match-rules";
import { updateDemoData, findDemoDatasetByMatchId, useDemoRevision } from "@/lib/mc-demo/store";
import type {
  ScoringSession,
  CurrentBatterState,
  CurrentBowlerState,
  CurrentOverState,
} from "./use-scoring-session";

type MCMatch = Database["public"]["Tables"]["mc_matches"]["Row"];
type MCMatchSquad = Database["public"]["Tables"]["mc_match_squads"]["Row"];

function countCompletedLegalDeliveries(events: MCBallEvent[]) {
  return events.filter((e) => countsAsBall(e)).length;
}

/**
 * Local, write-through scoring session for demo-* matches.
 * Same public shape as useScoringSession — reuses the exact same engines
 * (ball-event positions, rules replay, statistics) but persists to the
 * DemoStore in localStorage instead of Supabase.
 */
export function useDemoScoringSession(matchId: string): ScoringSession & {
  tenantId: string | null;
  isDemo: true;
} {
  const demoRevision = useDemoRevision();
  const dataset = useMemo(() => findDemoDatasetByMatchId(matchId), [matchId, demoRevision]);
  const tenantId = dataset?.tenantId ?? null;

  // Subscribe implicitly by reading the store on every render — the callers
  // wrap this in components that already re-render on setDemoMode / update.
  const demo = dataset?.data ?? null;

  const match = useMemo<MCMatch | null>(
    () => (demo?.matches.find((m) => m.id === matchId) as unknown as MCMatch | null) ?? null,
    [demo, matchId],
  );

  const inningsAll = useMemo<MCInnings[]>(
    () => (demo?.innings ?? []).filter((i) => i.match_id === matchId),
    [demo, matchId],
  );

  const activeInnings = useMemo<MCInnings | null>(() => {
    const inProgress = inningsAll.find((i) => i.status === "in_progress");
    if (inProgress) return inProgress;
    return inningsAll[inningsAll.length - 1] ?? null;
  }, [inningsAll]);

  const events = useMemo<MCBallEvent[]>(() => {
    if (!demo || !activeInnings) return [];
    return demo.ballEvents
      .filter((e) => e.innings_id === activeInnings.id)
      .slice()
      .sort((a, b) => a.sequence_number - b.sequence_number);
  }, [demo, activeInnings]);

  const eventsRef = useRef<MCBallEvent[]>(events);
  eventsRef.current = events;

  // Playing XI is synthesised from the stored per-match squads.
  const playingXI = useMemo<MCMatchSquad[]>(() => {
    if (!demo || !match) return [];
    const squads = demo.matchSquads[matchId] ?? {};
    const rows: MCMatchSquad[] = [];
    Object.entries(squads).forEach(([teamId, players]) => {
      players.forEach((p, idx) => {
        rows.push({
          id: `demo-sq-${matchId}-${teamId}-${idx}`,
          match_id: matchId,
          team_id: teamId,
          athlete_profile_id: p.id,
          external_player_name: null,
          role: null,
          batting_order: idx + 1,
          created_at: match.created_at ?? new Date().toISOString(),
          tenant_id: tenantId ?? "",
        } as unknown as MCMatchSquad);
      });
    });
    return rows;
  }, [demo, match, matchId, tenantId]);

  const battingSquad = useMemo(
    () =>
      activeInnings ? playingXI.filter((p) => p.team_id === activeInnings.batting_team_id) : [],
    [playingXI, activeInnings],
  );
  const bowlingSquad = useMemo(
    () =>
      activeInnings ? playingXI.filter((p) => p.team_id === activeInnings.bowling_team_id) : [],
    [playingXI, activeInnings],
  );

  const wicketLimit = useMemo(
    () => wicketLimitForTeam(playingXI, activeInnings?.batting_team_id ?? null),
    [playingXI, activeInnings?.batting_team_id],
  );

  const matchState = useMemo<MatchState>(
    () =>
      replayInnings(events, {
        totalOvers: (match as { overs?: number | null } | null)?.overs ?? null,
        maxWickets: wicketLimit,
        target: activeInnings?.target ?? null,
      }),
    [events, match, activeInnings?.target, wicketLimit],
  );

  // Reconstruct current striker/non-striker/bowler from the event tail so
  // the panels stay in sync after page reload.
  const lastEvent = events[events.length - 1];
  // Same "who is at the crease when the scorer opens" code as the live scorer.
  const resumed = useMemo(() => resumeLineup(events, matchState), [events, matchState]);
  const inferredStriker = resumed.striker;
  const inferredNonStriker = resumed.nonStriker;
  const inferredBowler = resumed.bowler;

  // Local UI overrides for striker/non-striker/bowler (nulls fall back to inferred).
  const [strikerOverride, setStrikerOverride] = useState<CurrentBatterState | null>(null);
  const [nonStrikerOverride, setNonStrikerOverride] = useState<CurrentBatterState | null>(null);
  const [bowlerOverride, setBowlerOverride] = useState<CurrentBowlerState | null>(null);

  // When events change (rotation etc.), clear stale overrides so replay wins.
  const lastEventSeq = lastEvent?.sequence_number ?? -1;
  const lastSeenRef = useRef<number>(lastEventSeq);
  const activeInningsId = activeInnings?.id ?? null;
  const lastInningsRef = useRef<string | null>(activeInningsId);

  // 1. CLEAR ON INNINGS TRANSITION
  if (lastInningsRef.current !== activeInningsId) {
    lastInningsRef.current = activeInningsId;
    // reset everything when the innings itself changes (Task 1)
    if (strikerOverride) setStrikerOverride(null);
    if (nonStrikerOverride) setNonStrikerOverride(null);
    if (bowlerOverride) setBowlerOverride(null);
    // sync the event sequence ref too so we don't double-trigger below
    lastSeenRef.current = lastEventSeq;
  }
  // 2. CLEAR ON NEW EVENT (Supersede optimistic pick)
  else if (lastSeenRef.current !== lastEventSeq) {
    lastSeenRef.current = lastEventSeq;
    const batterChoiceStillNeeded = Boolean(lastEvent?.dismissal_type);
    // reset overrides after each ball — replay is now source of truth
    if (!batterChoiceStillNeeded && strikerOverride) setStrikerOverride(null);
    if (!batterChoiceStillNeeded && nonStrikerOverride) setNonStrikerOverride(null);
    // keep bowler override until end of over
    if (bowlerOverride && lastEvent) {
      // Clear if bowler in event matches override
      if (
        (bowlerOverride.athleteId && bowlerOverride.athleteId === lastEvent.bowler_athlete_id) ||
        (bowlerOverride.name && bowlerOverride.name === lastEvent.bowler_name)
      ) {
        setBowlerOverride(null);
      }
    }
  }

  const striker = strikerOverride ?? inferredStriker;
  const nonStriker = nonStrikerOverride ?? inferredNonStriker;
  const bowler = bowlerOverride ?? inferredBowler;
  const strikerRef = useRef<CurrentBatterState>(striker);
  const nonStrikerRef = useRef<CurrentBatterState>(nonStriker);
  const bowlerRef = useRef<CurrentBowlerState>(bowler);
  strikerRef.current = striker;
  nonStrikerRef.current = nonStriker;
  bowlerRef.current = bowler;

  const setStrikerImmediate = useCallback((s: CurrentBatterState) => {
    strikerRef.current = s;
    setStrikerOverride(s);
  }, []);
  const setNonStrikerImmediate = useCallback((s: CurrentBatterState) => {
    nonStrikerRef.current = s;
    setNonStrikerOverride(s);
  }, []);
  const setBowlerImmediate = useCallback((b: CurrentBowlerState) => {
    bowlerRef.current = b;
    setBowlerOverride(b);
  }, []);
  const getLive = useCallback(
    () => ({
      striker: strikerRef.current,
      nonStriker: nonStrikerRef.current,
      bowler: bowlerRef.current,
    }),
    [],
  );

  const currentOver = useMemo<CurrentOverState>(() => {
    if (events.length === 0) return { overNumber: 0, ballsBowled: 0, events: [] };
    const lastOver = events[events.length - 1].over_number;
    const overEvents = events.filter((e) => e.over_number === lastOver);
    const legal = overEvents.filter((e) =>
      countsAsBall(e),
    ).length;
    return { overNumber: lastOver, ballsBowled: legal, events: overEvents };
  }, [events]);

  const startInnings = useCallback<ScoringSession["startInnings"]>(
    async (input: Omit<CreateInningsInput, "tenantId" | "matchId">) => {
      if (!tenantId || !demo) throw new Error("Demo dataset unavailable.");
      const created: MCInnings = {
        id: `demo-innings-${matchId}-${input.inningsNumber}-${Date.now()}`,
        tenant_id: tenantId,
        match_id: matchId,
        innings_number: input.inningsNumber,
        batting_team_id: input.battingTeamId,
        bowling_team_id: input.bowlingTeamId,
        target: input.target ?? null,
        status: "in_progress",
        runs: 0,
        wickets: 0,
        overs: 0,
        balls: 0,
        extras: 0,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as MCInnings;
      updateDemoData(tenantId, (d) => {
        // close any in_progress innings for this match
        d.innings = d.innings.map((i) =>
          i.match_id === matchId && i.status === "in_progress"
            ? ({ ...i, status: "completed", completed_at: new Date().toISOString() } as MCInnings)
            : i,
        );
        d.innings.push(created);
      });
      eventsRef.current = [];
      return created;
    },
    [tenantId, demo, matchId],
  );

  const submitBall = useCallback<ScoringSession["submitBall"]>(
    async (partial) => {
      if (!tenantId) throw new Error("Demo tenant missing.");
      if (!activeInnings) throw new Error("Start an innings first.");
      if (activeInnings.status !== "in_progress") throw new Error("Innings is not in progress.");
      const currentStriker = strikerRef.current;
      const currentNonStriker = nonStrikerRef.current;
      const currentBowler = bowlerRef.current;

      const priorEvents = eventsRef.current;
      const completedLegalBallsBefore = countCompletedLegalDeliveries(priorEvents);
      const pos = nextPosition(priorEvents);

      // Same rules check and same "who bats next" code as the live scorer.
      const prepared = prepareBall({
        events: priorEvents,
        lineup: { striker: currentStriker, nonStriker: currentNonStriker, bowler: currentBowler },
        input: partial,
        innings: activeInnings,
        matchStatus: match?.status ?? null,
        totalOvers: (match as { overs?: number | null } | null)?.overs ?? null,
        maxWickets: wicketLimit,
        enforceBowlerQuota: false,
        blockWhenMatchOver: false,
        ids: {
          eventId: `demo-ev-${matchId}-${activeInnings.innings_number}-${pos.sequenceNumber}`,
          tenantId,
          matchId,
          createdBy: null,
        },
      });
      const created = prepared.event;
      const legal = created.is_legal_delivery;
      eventsRef.current = [...priorEvents, created];
      // Update innings aggregate cache too so list views agree at a glance.
      const total = (partial.runsOffBat ?? 0) + (partial.extraRuns ?? 0);
      const wicket = partial.dismissalType ? 1 : 0;
      const legalBallsAfter = completedLegalBallsBefore + (legal ? 1 : 0);

      updateDemoData(tenantId, (d) => {
        d.ballEvents = [...d.ballEvents, created];
        d.innings = d.innings.map((i) =>
          i.id === activeInnings.id
            ? ({
                ...i,
                runs: (i.runs ?? 0) + total,
                wickets: (i.wickets ?? 0) + wicket,
                extras: (i.extras ?? 0) + (partial.extraRuns ?? 0),
                overs: Math.floor(legalBallsAfter / 6),
                balls: legalBallsAfter % 6,
                updated_at: new Date().toISOString(),
              } as MCInnings)
            : i,
        );
        // Refresh match "current_score" / "current_overs" for list badges
        const runsAfter = (activeInnings.runs ?? 0) + total;
        const wicketsAfter = (activeInnings.wickets ?? 0) + wicket;
        d.matches = d.matches.map((m) =>
          m.id === matchId
            ? ({
                ...m,
                current_score: `${runsAfter}/${wicketsAfter}`,
                current_overs: `${Math.floor(legalBallsAfter / 6)}.${legalBallsAfter % 6}`,
                updated_at: new Date().toISOString(),
              } as typeof m)
            : m,
        );
      });

      // Strike rotation for local UI pointer.
      const next = prepared;
      const overCompleted = prepared.overCompleted;
      if (
        next.striker.athleteId !== currentStriker.athleteId ||
        next.striker.name !== currentStriker.name ||
        next.nonStriker.athleteId !== currentNonStriker.athleteId ||
        next.nonStriker.name !== currentNonStriker.name
      ) {
        setStrikerImmediate(next.striker);
        setNonStrikerImmediate(next.nonStriker);
      }
      if (overCompleted) {
        // Force the UI to prompt for a new bowler.
        setBowlerImmediate({ athleteId: null, name: null });
      }

      return created;
    },
    [
      tenantId,
      matchId,
      activeInnings,
      matchState,
      match?.status,
      setStrikerImmediate,
      setNonStrikerImmediate,
      setBowlerImmediate,
    ],
  );

  const undo = useCallback<ScoringSession["undo"]>(async () => {
    if (!tenantId || !activeInnings) return null;
    const evs = eventsRef.current;
    const last = evs[evs.length - 1] ?? null;
    if (!last) return null;
    updateDemoData(tenantId, (d) => {
      d.ballEvents = d.ballEvents.filter((e) => e.id !== last.id);
      // Roll back innings aggregate too
      const total = (last.runs_off_bat ?? 0) + (last.extra_runs ?? 0);
      const wicket = last.dismissal_type ? 1 : 0;
      d.innings = d.innings.map((i) =>
        i.id === activeInnings.id
          ? ({
              ...i,
              runs: Math.max(0, (i.runs ?? 0) - total),
              wickets: Math.max(0, (i.wickets ?? 0) - wicket),
              extras: Math.max(0, (i.extras ?? 0) - (last.extra_runs ?? 0)),
              updated_at: new Date().toISOString(),
            } as MCInnings)
          : i,
      );
    });
    // Everyone goes back to where they stood just before the removed ball
    // (same as the live scorer), so picks made before that ball are kept.
    const before = lineupBeforeBall(last);
    setStrikerImmediate(before.striker);
    setNonStrikerImmediate(before.nonStriker);
    setBowlerImmediate(before.bowler);
    return last;
  }, [tenantId, activeInnings, setStrikerImmediate, setNonStrikerImmediate, setBowlerImmediate]);

  const reload = useCallback(async () => {
    // No-op — demo store is live via useSyncExternalStore subscribers.
  }, []);

  return {
    loading: false,
    error: null,
    match,
    innings: inningsAll,
    activeInnings,
    events,
    playingXI,
    battingSquad,
    bowlingSquad,
    striker,
    nonStriker,
    bowler,
    currentOver,
    matchState,
    wicketLimit,
    setStriker: setStrikerImmediate,
    setNonStriker: setNonStrikerImmediate,
    setBowler: setBowlerImmediate,
    getLive,
    startInnings,
    submitBall,
    undo,
    reload,
    tenantId,
    isDemo: true,
  };
}

/** Locally finalize a demo match — sets locked flag + result string + POM. */
export function finalizeDemoMatch(
  tenantId: string,
  matchId: string,
  opts: {
    winnerTeamId: string | null;
    result: string;
    pomAthleteId: string | null;
  },
) {
  updateDemoData(tenantId, (d) => {
    d.matches = d.matches.map((m) =>
      m.id === matchId
        ? ({
            ...m,
            match_locked: true,
            status: "completed",
            winner_team: opts.winnerTeamId,
            result: opts.result,
            player_of_match_athlete_id: opts.pomAthleteId,
            updated_at: new Date().toISOString(),
          } as typeof m)
        : m,
    );
    d.innings = d.innings.map((i) =>
      i.match_id === matchId && i.status === "in_progress"
        ? ({ ...i, status: "completed", completed_at: new Date().toISOString() } as MCInnings)
        : i,
    );
  });
}
