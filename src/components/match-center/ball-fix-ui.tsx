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
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setPicked(null);
  }, [open]);

  const pickedIndex = picked ? fix.balls.findIndex((b) => b.id === picked) : -1;
  const pickedBall = pickedIndex >= 0 ? fix.balls[pickedIndex] : null;
  // balls are newest first, so everything before the picked one in the list comes after it in play
  const laterCount = pickedIndex >= 0 ? pickedIndex : 0;

  const goBack = async () => {
    if (!picked) return;
    onOpenChange(false);
    await fix.rewindTo(picked);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-3 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4 text-left">
          <DialogTitle>Fix an earlier ball</DialogTitle>
          <DialogDescription>
            Pick the ball that was scored wrong. You score it again with the normal buttons, then the balls after
            it are put back.
          </DialogDescription>
        </DialogHeader>

        {pickedBall ? (
          <div className="space-y-3 px-4 pb-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="font-semibold">
                {pickedBall.overLabel} · {pickedBall.chip}
              </div>
              <div className="text-muted-foreground">{pickedBall.who}</div>
            </div>
            <p className="text-sm text-muted-foreground">
              {laterCount === 0
                ? "This is the last ball. It will be taken off so you can score it again."
                : `This ball and the ${laterCount} ball${laterCount === 1 ? "" : "s"} after it are taken off the scorecard and held. The public score shows fewer balls until you tap Re-apply.`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={() => setPicked(null)}>
                Pick another
              </Button>
              <Button className="h-12" onClick={() => void goBack()}>
                Go back to it
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-h-[60dvh] overflow-y-auto px-2 pb-3">
            {fix.balls.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No balls scored yet.</p>
            ) : (
              <ul className="divide-y">
                {fix.balls.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(b.id)}
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
                        <span className="block text-sm font-medium">{b.overLabel}</span>
                        <span className="block truncate text-xs text-muted-foreground">{b.who}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
                {held === 0 ? "Fixed. Ready to finish." : `Fixed. ${heldText} on hold.`}
              </div>
              <div className="text-muted-foreground">
                Score any missed ball first if needed, then re-apply.
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold">
                Score {fix.originalLabel} again{fix.originalChip ? ` (it was ${fix.originalChip})` : ""}
              </div>
              <div className="text-muted-foreground">
                {held === 0 ? "Nothing is waiting after it." : `${heldText} wait${held === 1 ? "s" : ""} after it.`}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {fix.entered ? (
          <>
            <Button className="h-11" disabled={fix.busy} onClick={() => void fix.reapply()}>
              {held === 0 ? "Finish" : `Re-apply ${heldText}`}
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
                {sure ? "Tap again to discard" : "Discard them"}
              </Button>
            ) : (
              <Button variant="outline" className="h-11" disabled={fix.busy} onClick={() => void fix.putBack()}>
                <RotateCcw className="mr-1.5 size-4" /> Put it back
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
            <RotateCcw className="mr-1.5 size-4" /> Put it back as it was
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
          Cancel the fix and put everything back as it was
        </Button>
      ) : null}
    </div>
  );
}
