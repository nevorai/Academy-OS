import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ballHelpers } from "@/hooks/use-scoring-session";
import type { DismissalType, ExtraType, MCBallEvent } from "@/lib/mc-ball-events";
import type { WicketSheetResult } from "@/components/match-center/wicket-sheet";
import { useExtraEntry } from "@/components/match-center/scorer-extras";

/**
 * Saving a ball, undo, redo, wicket and extras: ONE copy for the live scorer
 * and the demo scorer, so a fix is made once and the two can never drift apart.
 */
interface SessionLike {
  submitBall: (partial: never) => Promise<unknown>;
  undo: () => Promise<MCBallEvent | null | undefined | void>;
}

interface PlayerRef {
  athleteId?: string | null;
  name?: string | null;
}

export function useBallActions<S extends SessionLike>({
  session,
  striker,
  nonStriker,
  mustPickBeforeBall,
  requiredPicker,
  pendingBallIntent,
  setPendingBallIntent,
  swapAfterBatterRef,
  setDismissOpen,
  setWicketKind,
}: {
  session: S;
  striker: PlayerRef;
  nonStriker: PlayerRef;
  /** A batter or bowler must be picked before the next ball can be saved. */
  mustPickBeforeBall: boolean;
  requiredPicker: unknown;
  pendingBallIntent: Parameters<S["submitBall"]>[0] | null;
  setPendingBallIntent: (p: Parameters<S["submitBall"]>[0] | null) => void;
  swapAfterBatterRef: { current: boolean };
  setDismissOpen: (v: boolean) => void;
  setWicketKind: (k: DismissalType | null) => void;
}) {
  type Partial = Parameters<S["submitBall"]>[0];
  const [redoStack, setRedoStack] = useState<MCBallEvent[]>([]);
  // One ball at a time: a fast double tap must never save two balls.
  const savingBallRef = useRef(false);

  const submit = async (partial: Partial): Promise<boolean> => {
    if (savingBallRef.current) return false;
    savingBallRef.current = true;
    try {
      await session.submitBall(partial);
      setRedoStack([]);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record ball");
      return false;
    } finally {
      savingBallRef.current = false;
    }
  };

  const requestSubmit = (partial: Partial) => {
    if (mustPickBeforeBall) {
      setPendingBallIntent(partial);
      return;
    }
    void submit(partial);
  };

  useEffect(() => {
    if (!pendingBallIntent || requiredPicker) return;
    const next = pendingBallIntent;
    setPendingBallIntent(null);
    void submit(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBallIntent, requiredPicker]);

  const handleUndo = async () => {
    try {
      const removed = await session.undo();
      if (removed) setRedoStack((s) => [...s, removed as MCBallEvent]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to undo");
    }
  };

  const handleRedo = async () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setRedoStack((s) => s.slice(0, -1));
    try {
      await session.submitBall({
        runsOffBat: next.runs_off_bat ?? 0,
        extraType: (next.extra_type ?? null) as ExtraType | null,
        extraRuns: next.extra_runs ?? 0,
        dismissalType: (next.dismissal_type ?? null) as DismissalType | null,
        dismissedAthleteId: next.dismissed_athlete_id ?? null,
        dismissedName: next.dismissed_name ?? null,
        fielderAthleteId: next.fielder_athlete_id ?? null,
        fielderName: next.fielder_name ?? null,
        comment: next.comment ?? null,
      } as never);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to redo");
      setRedoStack((s) => [...s, next]);
    }
  };

  const onRun = (r: 0 | 1 | 2 | 3 | 4 | 5 | 6) => requestSubmit(ballHelpers.run(r) as Partial);

  const { setExtraKind, quickExtra, extrasModals } = useExtraEntry({
    requestSubmit: requestSubmit as never,
    openWicket: () => {
      setWicketKind(null);
      setDismissOpen(true);
    },
  });

  const handleWicket = async (r: WicketSheetResult) => {
    setDismissOpen(false);
    const dismissedRef =
      r.dismissed === "non-striker"
        ? { id: nonStriker.athleteId, name: nonStriker.name }
        : { id: striker.athleteId, name: striker.name };
    const ok = await submit({
      ...r.partial,
      fielderAthleteId: r.fielder?.id && !r.fielder.id.startsWith("ext:") ? r.fielder.id : null,
      fielderName: r.fielder?.name ?? null,
      dismissedAthleteId: dismissedRef.id,
      dismissedName: dismissedRef.name,
    } as Partial);
    // Run out after the batters crossed: the next batter picked takes the other end.
    swapAfterBatterRef.current = ok && r.crossed;
  };

  return {
    redoStack,
    submit,
    requestSubmit,
    handleUndo,
    handleRedo,
    onRun,
    handleWicket,
    setExtraKind,
    quickExtra,
    extrasModals,
  };
}
