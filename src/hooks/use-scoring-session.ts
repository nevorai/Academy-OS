import { DB_SCHEMA } from "@/lib/db-schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  appendBallEvent,
  BallEventError,
  createInnings,
  countsAsBall,
  isLegalDelivery,
  listBallEvents,
  listInningsForMatch,
  nextPosition,
  undoLastBallEvent,
  type AppendBallInput,
  type CreateInningsInput,
  type ExtraType,
  type MCBallEvent,
  type MCInnings,
} from "@/lib/mc-ball-events";
import { replayInnings, type MatchState } from "@/lib/mc-rules-engine";
import {
  isRetryableSaveError,
  lineupBeforeBall,
  prepareBall,
  saveWithRetry,
} from "@/lib/mc-scoring-core";
import { wicketLimitForTeam } from "@/lib/mc-match-rules";


type MCMatch = Database["public"]["Tables"]["mc_matches"]["Row"];
type MCMatchSquad = Database["public"]["Tables"]["mc_match_squads"]["Row"];

/* ================================================================
 * useScoringSession(matchId)
 *
 * Loads match + innings + ball events + playing XI, and exposes
 * mutations. Never stores derived statistics — only the event log
 * plus positional pointers (current over / ball / active innings).
 * ================================================================ */

export interface CurrentBatterState {
  athleteId: string | null;
  name: string | null;
  onStrike: boolean;
}

export interface CurrentBowlerState {
  athleteId: string | null;
  name: string | null;
}

export interface CurrentOverState {
  overNumber: number;
  ballsBowled: number; // legal deliveries this over (0..6)
  events: MCBallEvent[]; // events in current over (any delivery)
}

export interface ScoringSession {
  loading: boolean;
  error: string | null;

  match: MCMatch | null;
  innings: MCInnings[];
  activeInnings: MCInnings | null;
  events: MCBallEvent[]; // active innings events, in order

  playingXI: MCMatchSquad[];
  battingSquad: MCMatchSquad[];
  bowlingSquad: MCMatchSquad[];

  striker: CurrentBatterState;
  nonStriker: CurrentBatterState;
  bowler: CurrentBowlerState;
  currentOver: CurrentOverState;

  /** Reconstructed match state (pure replay of the event log). */
  matchState: MatchState;
  /** Wickets that bowl the batting side out (players on the side minus one, max 10). */
  wicketLimit: number;

  /* --- setters (UI-driven, no calculations) --- */
  setStriker: (b: CurrentBatterState) => void;
  setNonStriker: (b: CurrentBatterState) => void;
  setBowler: (b: CurrentBowlerState) => void;
  /** Who is at the crease and bowling right now, read from the latest values (not a render snapshot). */
  getLive: () => { striker: CurrentBatterState; nonStriker: CurrentBatterState; bowler: CurrentBowlerState };

  /* --- mutations --- */
  startInnings: (input: Omit<CreateInningsInput, "tenantId" | "matchId">) => Promise<MCInnings>;
  submitBall: (
    input: Omit<
      AppendBallInput,
      | "eventId"
      | "tenantId"
      | "matchId"
      | "inningsId"
      | "priorEvents"
      | "strikerAthleteId"
      | "strikerName"
      | "nonStrikerAthleteId"
      | "nonStrikerName"
      | "bowlerAthleteId"
      | "bowlerName"
    >,
  ) => Promise<MCBallEvent>;
  undo: () => Promise<MCBallEvent | null>;
  reload: () => Promise<void>;
}

/* ---------- helpers ---------- */

function pickActiveInnings(list: MCInnings[]): MCInnings | null {
  const inProgress = list.find((i) => i.status === "in_progress");
  if (inProgress) return inProgress;
  return list[list.length - 1] ?? null;
}

function buildCurrentOver(events: MCBallEvent[]): CurrentOverState {
  if (events.length === 0) {
    return { overNumber: 0, ballsBowled: 0, events: [] };
  }
  const lastOver = events[events.length - 1].over_number;
  const overEvents = events.filter((e) => e.over_number === lastOver);
  // Derive legality from extra_type — the single source of truth. Never
  // rely on the stored flag (may be stale on optimistic / legacy rows).
  const legal = overEvents.filter((e) => countsAsBall(e)).length;
  return { overNumber: lastOver, ballsBowled: legal, events: overEvents };
}

function makeClientEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
  );
}

/* ---------- hook ---------- */

export function useScoringSession(
  matchId: string | undefined,
  opts: { tenantId?: string; userId?: string | null } = {},
): ScoringSession {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [match, setMatch] = useState<MCMatch | null>(null);
  const [innings, setInnings] = useState<MCInnings[]>([]);
  const [events, setEvents] = useState<MCBallEvent[]>([]);
  const [playingXI, setPlayingXI] = useState<MCMatchSquad[]>([]);

  const [striker, setStrikerState] = useState<CurrentBatterState>({
    athleteId: null,
    name: null,
    onStrike: true,
  });
  const [nonStriker, setNonStrikerState] = useState<CurrentBatterState>({
    athleteId: null,
    name: null,
    onStrike: false,
  });
  const [bowler, setBowlerState] = useState<CurrentBowlerState>({
    athleteId: null,
    name: null,
  });

  const activeInnings = useMemo(() => pickActiveInnings(innings), [innings]);

  const eventsRef = useRef<MCBallEvent[]>([]);
  const strikerRef = useRef<CurrentBatterState>(striker);
  const nonStrikerRef = useRef<CurrentBatterState>(nonStriker);
  const bowlerRef = useRef<CurrentBowlerState>(bowler);
  // Serialized network queue so rapid taps don't fire concurrent
  // appendBallEvent calls (which would race on sequence_number). The
  // optimistic UI update still happens synchronously on every call.
  const netQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const setStriker = useCallback((b: CurrentBatterState) => {
    strikerRef.current = b;
    setStrikerState(b);
  }, []);
  const setNonStriker = useCallback((b: CurrentBatterState) => {
    nonStrikerRef.current = b;
    setNonStrikerState(b);
  }, []);
  const setBowler = useCallback((b: CurrentBowlerState) => {
    bowlerRef.current = b;
    setBowlerState(b);
  }, []);
  const getLive = useCallback(
    () => ({
      striker: strikerRef.current,
      nonStriker: nonStrikerRef.current,
      bowler: bowlerRef.current,
    }),
    [],
  );

  /* ---------- initial load ---------- */

  const load = useCallback(async () => {
    if (!matchId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: matchRow, error: matchErr }, inningsList, { data: squad }] = await Promise.all(
        [
          supabase.from("mc_matches").select("*").eq("id", matchId).maybeSingle(),
          listInningsForMatch(matchId),
          supabase.from("mc_match_squads").select("*").eq("match_id", matchId),
        ],
      );
      if (matchErr) throw matchErr;
      setMatch(matchRow ?? null);
      setInnings(inningsList);
      setPlayingXI(squad ?? []);

      const active = pickActiveInnings(inningsList);
      if (active) {
        const evs = await listBallEvents(active.id);
        eventsRef.current = evs;
        setEvents(evs);
      } else {
        eventsRef.current = [];
        setEvents([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load match.");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- realtime: broadcast ball events to any subscriber ---------- */

  useEffect(() => {
    if (!activeInnings?.id) return;
    const channel = supabase
      .channel(`mc_ball_events:${activeInnings.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: DB_SCHEMA,
          table: "mc_ball_events",
          filter: `innings_id=eq.${activeInnings.id}`,
        },
        (payload) => {
          setEvents((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as MCBallEvent;
              if (prev.some((e) => e.id === row.id)) return prev;
              return [...prev, row].sort((a, b) => a.sequence_number - b.sequence_number);
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as MCBallEvent;
              return prev.filter((e) => e.id !== row.id);
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as MCBallEvent;
              return prev.map((e) => (e.id === row.id ? row : e));
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeInnings?.id]);

  /* ---------- squads split by innings ---------- */

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

  /* ---------- current over ---------- */

  const currentOver = useMemo(() => buildCurrentOver(events), [events]);

  /* ---------- reconstructed match state (pure replay) ---------- */

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

  /* ---------- mutations ---------- */

  const startInnings = useCallback(
    async (input: Omit<CreateInningsInput, "tenantId" | "matchId">) => {
      if (!matchId) throw new BallEventError("INVALID_MATCH", "Missing match.");
      if (!opts.tenantId) throw new BallEventError("INVALID_TENANT", "Missing tenant.");
      if (match?.status === "completed" || match?.status === "archived") {
        throw new BallEventError("MATCH_COMPLETED", "Match is no longer active.");
      }
      const created = await createInnings({
        ...input,
        tenantId: opts.tenantId,
        matchId,
      });
      setInnings((prev) => [...prev, created]);
      eventsRef.current = [];
      setEvents([]);
      return created;
    },
    [matchId, opts.tenantId, match?.status],
  );

  const submitBall = useCallback<ScoringSession["submitBall"]>(
    async (partial) => {
      if (!matchId) throw new BallEventError("INVALID_MATCH", "Missing match.");
      if (!opts.tenantId) throw new BallEventError("INVALID_TENANT", "Missing tenant.");
      if (!activeInnings)
        throw new BallEventError("INVALID_INNINGS", "Start an innings before scoring.");
      if (activeInnings.status !== "in_progress")
        throw new BallEventError("INNINGS_CLOSED", "Innings is not in progress.");
      if (match?.status === "completed" || match?.status === "archived")
        throw new BallEventError("MATCH_COMPLETED", "Match is no longer active.");
      
      const currentStriker = strikerRef.current;
      const currentNonStriker = nonStrikerRef.current;
      const currentBowler = bowlerRef.current;
      const priorEvents = eventsRef.current;

      // Rules check + the row to save + who bats next: one shared, tested function.
      const prepared = prepareBall({
        events: priorEvents,
        lineup: { striker: currentStriker, nonStriker: currentNonStriker, bowler: currentBowler },
        input: partial,
        innings: activeInnings,
        matchStatus: match?.status ?? null,
        totalOvers: (match as { overs?: number | null } | null)?.overs ?? null,
        maxWickets: wicketLimit,
        ids: {
          eventId: makeClientEventId(),
          tenantId: opts.tenantId,
          matchId,
          createdBy: opts.userId ?? null,
        },
      });
      const optimistic = prepared.event;

      eventsRef.current = [...priorEvents, optimistic];
      setEvents(eventsRef.current);

      // Strike rotation for the UI pointer (state is still derived from events).
      if (
        prepared.striker.athleteId !== currentStriker.athleteId ||
        prepared.striker.name !== currentStriker.name ||
        prepared.nonStriker.athleteId !== currentNonStriker.athleteId ||
        prepared.nonStriker.name !== currentNonStriker.name
      ) {
        setStriker(prepared.striker);
        setNonStriker(prepared.nonStriker);
      }

      // Saves go one after another so the order on the server is the order tapped.
      // The screen has already moved on; we do NOT wait for the network here, so
      // fast taps never queue behind a slow connection at the ground.
      //
      // A dropped connection retries the SAME row (same place in the over, same
      // batters) for about 30 seconds. If it still cannot be saved, this ball and
      // every ball tapped after it come off the screen together, so what the
      // scorer sees is always what is saved.
      const stillOnScreen = () => eventsRef.current.some((ev) => ev.id === optimistic.id);
      let toldSlow = false;
      const networkPromise = netQueueRef.current
        .catch(() => {})
        .then(() => {
          if (!stillOnScreen()) return undefined; // an earlier ball failed and took this one off
          return saveWithRetry(
            () =>
              appendBallEvent({
                eventId: optimistic.id,
                tenantId: opts.tenantId!,
                matchId,
                inningsId: activeInnings.id,
                strikerAthleteId: currentStriker.athleteId,
                strikerName: currentStriker.name,
                nonStrikerAthleteId: currentNonStriker.athleteId,
                nonStrikerName: currentNonStriker.name,
                bowlerAthleteId: currentBowler.athleteId,
                bowlerName: currentBowler.name,
                createdBy: opts.userId ?? null,
                priorEvents,
                ...partial,
              }).then(() => undefined),
            {
              onRetry: () => {
                if (toldSlow) return;
                toldSlow = true;
                toast.message("Weak internet. Saving the ball again...", { duration: 4000 });
              },
            },
          );
        })
        .catch((e) => {
          console.error("[scoring] ball not saved", e);
          const idx = eventsRef.current.findIndex((ev) => ev.id === optimistic.id);
          if (idx < 0) return;
          const dropped = eventsRef.current.length - idx;
          eventsRef.current = eventsRef.current.slice(0, idx);
          setEvents(eventsRef.current);
          setStriker(currentStriker);
          setNonStriker(currentNonStriker);
          setBowler(currentBowler);
          if (isRetryableSaveError(e)) {
            toast.error(
              dropped === 1
                ? "No internet: the last ball was NOT saved. Enter it again."
                : `No internet: the last ${dropped} balls were NOT saved. Enter them again.`,
              { duration: 10000 },
            );
          } else {
            // The server refused the ball (for example another phone is scoring
            // this match). Show what is really saved.
            toast.error("That ball could not be saved. The score was refreshed.", {
              duration: 8000,
            });
            void load();
          }
        });
      netQueueRef.current = networkPromise.catch(() => {});

      return optimistic;
    },
    [
      matchId,
      opts.tenantId,
      opts.userId,
      activeInnings,
      match?.status,
      match,
      setStriker,
      setNonStriker,
      setBowler,
      wicketLimit,
      load,
    ],
  );


  const undo = useCallback(async () => {
    if (!activeInnings) throw new BallEventError("INVALID_INNINGS", "No active innings.");
    // Let balls that are still being saved land first, so undo removes the ball the scorer sees last.
    await netQueueRef.current.catch(() => {});
    const removed = await undoLastBallEvent(activeInnings.id);
    if (removed) {
      const filtered = eventsRef.current.filter((e) => e.id !== removed.id);
      eventsRef.current = filtered;
      setEvents(filtered);
      // Universal undo: restore batters and bowler to the state that existed
      // just before the removed ball was recorded. The removed ball itself
      // captured that pre-ball snapshot (striker/non-striker/bowler fields),
      // so re-seating them from the removed event correctly reverses wickets
      // (dismissed batter returns), strike rotations, and end-of-over bowler
      // changes in a single step.
      const before = lineupBeforeBall(removed);
      setStriker(before.striker);
      setNonStriker(before.nonStriker);
      setBowler(before.bowler);
    }
    return removed;
  }, [activeInnings, setBowler, setStriker, setNonStriker]);


  return {
    loading,
    error,
    match,
    innings,
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
    setStriker,
    setNonStriker,
    setBowler,
    getLive,
    startInnings,
    submitBall,
    undo,
    reload: load,
  };
}

/* ================================================================
 * Convenience helpers for the scorer UI (still no derived stats).
 * Each returns a partial for `submitBall`.
 * ================================================================ */

export { ballHelpers } from "@/lib/mc-scoring-core";

export { countsAsBall, isLegalDelivery, nextPosition };
