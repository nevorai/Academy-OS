import { useEffect, useState } from "react";
import { History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BallFix } from "@/hooks/use-ball-fix";
import { cn } from "@/lib/utils";

/** The list of balls in this innings. Tap one to go back to it. */
export function BallFixSheet({
  open,
  onOpenChange,
  fix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fix: BallFix;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-3 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4 text-left">
          <DialogTitle>Which ball was wrong?</DialogTitle>
          <DialogDescription>
            Tap the ball and score it again with the normal buttons. The balls after it wait and
            come back when you finish. Tapped the wrong one? Cancel puts it all back.
          </DialogDescription>
        </DialogHeader>

        {
          <div className="max-h-[60dvh] overflow-y-auto px-2 pb-3">
            {fix.balls.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No balls scored yet.
              </p>
            ) : (
              <ul className="divide-y">
                {fix.balls.map((b, i) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => {
                        // One tap goes straight to scoring it again. No second box:
                        // the bar above the keys has "Cancel, keep the old ball".
                        onOpenChange(false);
                        void fix.rewindTo(b.id);
                      }}
                      className="flex min-h-14 w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "grid h-9 min-w-9 place-items-center rounded-full px-2 text-xs font-bold",
                          b.chip === "W"
                            ? "bg-destructive/15 text-destructive"
                            : b.isExtra
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-primary/10 text-primary",
                        )}
                      >
                        {b.chip}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {b.overLabel}
                          {i === 0 ? " · last ball" : ""}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {b.who}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        }
      </DialogContent>
    </Dialog>
  );
}

/** Shown above the scoring buttons while a fix is in progress. */
export function BallFixBar({ fix }: { fix: BallFix }) {
  const [sure, setSure] = useState(false);

  useEffect(() => {
    if (!sure) return;
    const t = window.setTimeout(() => setSure(false), 4000);
    return () => window.clearTimeout(t);
  }, [sure]);

  if (!fix.fix) return null;
  const held = fix.waiting;
  const heldText = `${held} later ball${held === 1 ? "" : "s"}`;

  return (
    <div
      role="status"
      className="mx-3 mb-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        {fix.busy ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
        ) : (
          <History className="mt-0.5 size-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          {fix.entered ? (
            <>
              <div className="font-semibold">
                {held === 0 ? "Done. Tap Finish." : `Done. ${heldText} waiting.`}
              </div>
              <div className="text-muted-foreground">
                Missed a ball? Score it now. Then tap the button below.
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold">
                Now score ball {fix.originalLabel} again
                {fix.originalChip ? ` (it was ${fix.originalChip})` : ""}
              </div>
              <div className="text-muted-foreground">
                {held === 0
                  ? "Nothing is waiting after it."
                  : `${heldText} wait${held === 1 ? "s" : ""} after it.`}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {fix.entered ? (
          <>
            <Button className="h-11" disabled={fix.busy} onClick={() => void fix.reapply()}>
              {held === 0 ? "Finish" : `Bring back ${heldText}`}
            </Button>
            {held > 0 ? (
              <Button
                variant="outline"
                className="h-11"
                disabled={fix.busy}
                onClick={() => {
                  if (!sure) setSure(true);
                  else {
                    setSure(false);
                    fix.discardHeld();
                  }
                }}
              >
                {sure ? "Tap again to delete" : "Delete them"}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-11"
                disabled={fix.busy}
                onClick={() => void fix.putBack()}
              >
                <RotateCcw className="mr-1.5 size-4" /> Cancel
              </Button>
            )}
          </>
        ) : (
          <Button
            variant="outline"
            className="col-span-2 h-11"
            disabled={fix.busy}
            onClick={() => void fix.putBack()}
          >
            <RotateCcw className="mr-1.5 size-4" /> Cancel, keep the old ball
          </Button>
        )}
      </div>
      {fix.entered && held > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-9 w-full text-xs text-muted-foreground"
          disabled={fix.busy}
          onClick={() => void fix.putBack()}
        >
          Cancel and keep everything as it was
        </Button>
      ) : null}
    </div>
  );
}
