import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ballHelpers } from "@/hooks/use-scoring-session";
import type { DismissalType, MCBallEvent } from "@/lib/mc-ball-events";
import { inputFromEvent, lineupBeforeBall, wicketInput } from "@/lib/mc-scoring-core";
import type { WicketSheetResult } from "@/components/match-center/wicket-sheet";
import { useExtraEntry } from "@/components/match-center/scorer-extras";

/**
 * Saving a ball, undo, redo, wicket and extras: ONE copy for the live scorer
 * and the demo scorer, so a fix is made once and the two can never drift apart.
 */
interface SessionLike {
  submitBall: (partial: never) => Promise<unknown>;
  undo: () => Promise<MCBallEvent | null | undefined | void>;
  setStriker: (b: { athleteId: string | null; name: string | null; onStrike: boolean }) => void;
  setNonStriker: (b: { athleteId: string | null; name: string | null; onStrike: boolean }) => void;
  setBowler: (b: { athleteId: string | null; name: string | null }) => void;
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
    if (!next || savingBallRef.current) return;
    savingBallRef.current = true;
    setRedoStack((s) => s.slice(0, -1));
    try {
      // The ball goes back with the batters and bowler it was first scored with.
      // Without this, a redo across a wicket or an over change failed ("Select
      // the striker", "same bowler cannot bowl consecutive overs").
      const before = lineupBeforeBall(next);
      session.setStriker(before.striker);
      session.setNonStriker(before.nonStriker);
      session.setBowler(before.bowler);
      await session.submitBall(inputFromEvent(next) as never);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to redo");
      setRedoStack((s) => [...s, next]);
    } finally {
      savingBallRef.current = false;
    }
  };

  const onRun = (r: 0 | 1 | 2 | 3 | 4 | 5 | 6) => requestSubmit(ballHelpers.run(r) as Partial);

  const { setExtraKind, quickExtra, submitExtra, extrasModals } = useExtraEntry({
    requestSubmit: requestSubmit as never,
    openWicket: () => {
      setWicketKind(null);
      setDismissOpen(true);
    },
  });

  const handleWicket = async (r: WicketSheetResult) => {
    setDismissOpen(false);
    await submit(
      wicketInput(
        {
          partial: r.partial,
          dismissed: r.dismissed,
          fielder: r.fielder
            ? {
                athleteId: r.fielder.id && !r.fielder.id.startsWith("ext:") ? r.fielder.id : null,
                name: r.fielder.name ?? null,
              }
            : null,
          // Saved with the ball, so the batter who is left stands at the right
          // end after undo, redo and when the scorer is opened again.
          crossed: r.crossed,
        },
        {
          striker: { athleteId: striker.athleteId ?? null, name: striker.name ?? null },
          nonStriker: { athleteId: nonStriker.athleteId ?? null, name: nonStriker.name ?? null },
        },
      ) as Partial,
    );
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
    submitExtra,
    extrasModals,
  };
}
