import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { MCBallEvent } from "@/lib/mc-ball-events";
import {
  clearSavedFix,
  fixableBalls,
  loadSavedFix,
  reapplyBalls,
  saveFix,
  type FixableBall,
} from "@/lib/mc-ball-fix";
import { ballChipLabel } from "@/lib/mc-commentary";
import type { ScoringSession } from "@/hooks/use-scoring-session";

type FixSession = Pick<
  ScoringSession,
  | "events"
  | "activeInnings"
  | "undo"
  | "submitBall"
  | "setStriker"
  | "setNonStriker"
  | "setBowler"
  | "getLive"
>;

export interface BallFixState {
  /** The ball being fixed, as it was first scored. */
  original: MCBallEvent;
  /** Every ball after it, oldest first. */
  held: MCBallEvent[];
  /** How many of `held` are already back on the scorecard. */
  done: number;
  /** How many balls the innings had once everything from the fixed ball on was taken off. */
  baseLen: number;
}

function overBall(e: MCBallEvent): string {
  return `over ${e.over_number + 1}, ball ${e.ball_number}`;
}

/**
 * Fix an earlier ball (shared by the live and the demo scorer).
 *
 * 1. rewindTo(ball): undo that ball and everything after it. The later balls are
 *    kept aside (and in the browser, so a closed tab does not lose them).
 * 2. The scorer enters the right result with the normal buttons.
 * 3. reapply(): the held balls go back one by one through the normal scoring
 *    path, so strike, wickets and over changes are worked out the usual way.
 *
 * putBack() restores the ball exactly as it was, if the scorer changes their mind.
 */
export function useBallFix(session: FixSession, onRewind?: () => void) {
  const inningsId = session.activeInnings?.id ?? null;
  const [fix, setFix] = useState<BallFixState | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const eventsRef = useRef(session.events);
  eventsRef.current = session.events;

  // A fix started before the tab closed or reloaded comes back.
  useEffect(() => {
    if (!inningsId) {
      setFix(null);
      return;
    }
    const saved = loadSavedFix(inningsId);
    setFix(
      saved
        ? { original: saved.original, held: saved.held, done: saved.done, baseLen: saved.baseLen }
        : null,
    );
  }, [inningsId]);

  const persist = useCallback(
    (next: BallFixState | null) => {
      setFix(next);
      if (!inningsId) return;
      if (next) saveFix({ inningsId, ...next });
      else clearSavedFix(inningsId);
    },
    [inningsId],
  );

  const balls: FixableBall[] = useMemo(() => fixableBalls(session.events), [session.events]);

  const io = useCallback(
    () => ({
      getLive: session.getLive,
      setStriker: session.setStriker,
      setNonStriker: session.setNonStriker,
      setBowler: session.setBowler,
      submitBall: (input: Parameters<ScoringSession["submitBall"]>[0]) => session.submitBall(input),
    }),
    [session],
  );

  const rewindTo = useCallback(
    async (eventId: string) => {
      if (busyRef.current || fix) return;
      const events = eventsRef.current;
      const idx = events.findIndex((e) => e.id === eventId);
      if (idx < 0) return;
      busyRef.current = true;
      setBusy(true);
      onRewind?.();
      const total = events.length - idx;
      const removed: MCBallEvent[] = []; // oldest first
      try {
        for (let i = 0; i < total; i += 1) {
          const r = await session.undo();
          if (!r) break;
          removed.unshift(r);
          // Save as we go: a dropped connection half way must not lose balls.
          persist({ original: removed[0], held: removed.slice(1), done: 0, baseLen: idx });
        }
        if (removed.length > 0 && removed.length < total) {
          toast.error("Could not go back all the way. Tap Put it back, then try again.");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not go back to that ball");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [fix, onRewind, persist, session],
  );

  /** Re-apply the held balls that are not back yet. */
  const reapply = useCallback(async () => {
    if (busyRef.current || !fix) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const pending = fix.held.slice(fix.done);
      const prev = fix.done > 0 ? fix.held[fix.done - 1] : fix.original;
      const total = fix.held.length;
      const result = await reapplyBalls(
        io(),
        pending,
        eventsRef.current,
        (left) => persist({ ...fix, done: total - left.length }),
        prev,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      persist(null);
      toast.success(
        pending.length === 0
          ? "Ball fixed"
          : `Ball fixed. ${pending.length} later ball${pending.length === 1 ? "" : "s"} re-applied.`,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [fix, io, persist]);

  /** Put the ball back exactly as it was, with everything after it. */
  const putBack = useCallback(async () => {
    if (busyRef.current || !fix) return;
    busyRef.current = true;
    setBusy(true);
    try {
      // Everything entered since the rewind comes off first so the order is the original one.
      while (eventsRef.current.length > fix.baseLen) {
        const r = await session.undo();
        if (!r) break;
      }
      const all = [fix.original, ...fix.held];
      const result = await reapplyBalls(io(), all, eventsRef.current.slice(0, fix.baseLen), (left) => {
        // Half way back: the next ball to restore becomes the "ball being fixed".
        if (left.length > 0) {
          persist({
            original: left[0],
            held: left.slice(1),
            done: 0,
            baseLen: fix.baseLen + (all.length - left.length),
          });
        }
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      persist(null);
      toast.success("Everything is back as it was");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [fix, io, persist, session]);

  /** Throw away the held balls (never the balls already on the scorecard). */
  const discardHeld = useCallback(() => {
    if (!fix) return;
    persist(null);
    toast.message("Later balls discarded");
  }, [fix, persist]);

  const entered = fix ? session.events.length > fix.baseLen + fix.done : false;
  const waiting = fix ? fix.held.length - fix.done : 0;

  return {
    balls,
    fix,
    busy,
    entered,
    waiting,
    originalChip: fix ? ballChipLabel(fix.original) : null,
    originalLabel: fix ? overBall(fix.original) : null,
    rewindTo,
    reapply,
    putBack,
    discardHeld,
  };
}

export type BallFix = ReturnType<typeof useBallFix>;
