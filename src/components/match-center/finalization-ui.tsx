/**
 * Match Finalization UI
 * -----------------------------------------------------------------
 * Multi-step dialog that walks Scorer/Admin through:
 *   1. Final match summary
 *   2. Confirm winner (with admin override)
 *   3. Select Player Of The Match (suggestions + manual pick)
 *   4. Review scorecard summary
 *   5. Finalize (lock)
 *
 * Reuses existing shadcn dialog primitives. Does NOT redesign the scorer.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Trophy, Lock, Unlock } from "lucide-react";
import {
  finalizeMatch,
  unlockMatch,
  suggestPlayerOfMatch,
  type MatchResult,
  type POMSuggestion,
  type VictoryType,
  type MCRole,
  canFinalize,
  canUnlock,
  canOverrideResult,
  notifyMatchCompleted,
  notifyPlayerOfMatch,
  notifyFinalResult,
} from "@/lib/mc-finalization";
import type { MCBallEvent } from "@/lib/mc-ball-events";
// Heavy engines are dynamic-imported inside the finalize handler so they
// only enter the chunk graph when the user actually finalizes / unlocks
// a match (a rare, action-triggered operation).

/* ============================================================
 * Finalization dialog
 * ============================================================ */

interface FinalizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  tenantId: string;
  actorId: string | null;
  role: MCRole;
  teamA: { id: string; name: string };
  teamB: { id: string; name: string };
  detectedResult: MatchResult;
  ballEvents: MCBallEvent[];
  onFinalized?: () => void;
}

export function FinalizationDialog({
  open,
  onOpenChange,
  matchId,
  tenantId,
  actorId,
  role,
  teamA,
  teamB,
  detectedResult,
  ballEvents,
  onFinalized,
}: FinalizationDialogProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  const [victoryType, setVictoryType] = useState<VictoryType>(detectedResult.victoryType);
  const [winnerTeamId, setWinnerTeamId] = useState<string | null>(detectedResult.winnerTeamId);
  const [overrideReason, setOverrideReason] = useState("");

  const suggestions = useMemo<POMSuggestion[]>(
    () => suggestPlayerOfMatch(ballEvents),
    [ballEvents],
  );
  const [pomAthleteId, setPomAthleteId] = useState<string | null>(
    suggestions[0]?.athleteId ?? null,
  );
  const [pomName, setPomName] = useState<string>(suggestions[0]?.name ?? "");

  const overridden =
    victoryType !== detectedResult.victoryType || winnerTeamId !== detectedResult.winnerTeamId;

  const runFinalize = async () => {
    if (busy) return; // one tap, one finalize
    if (!canFinalize(role)) {
      toast.error("You do not have permission to finalize this match");
      return;
    }
    setBusy(true);
    try {
      // 1) The part that matters: save the result and lock the match.
      await finalizeMatch({
        matchId,
        tenantId,
        actorId,
        result: detectedResult,
        playerOfMatchAthleteId: pomAthleteId,
        overrides: overridden
          ? {
              victoryType,
              winnerTeamId,
              winningMargin: victoryType === "won" ? detectedResult.winningMargin : null,
              winningMarginType:
                victoryType === "won"
                  ? detectedResult.winningMarginType
                  : victoryType === "tie"
                    ? "tie"
                    : "na",
              reason: overrideReason || undefined,
            }
          : undefined,
      });
      try {
        for (const k of Object.keys(window.sessionStorage)) {
          if (k.includes(tenantId) && k.toLowerCase().includes("draft"))
            window.sessionStorage.removeItem(k);
        }
      } catch {
        /* ignore */
      }
      toast.success("Match finalized");
      notifyMatchCompleted(detectedResult.summary);
      if (pomName) notifyPlayerOfMatch(pomName);
      notifyFinalResult(detectedResult.summary);

      // 2) Done for the user: close and leave straight away. No reload.
      onFinalized?.();
      onOpenChange(false);
      void navigate({ to: "/match-center/matches", replace: true });

      // 3) Stats, records, awards and the AI report finish quietly in the background.
      void (async () => {
        try {
          const [
            { updateCareersForMatch },
            { updateTournamentForMatch },
            { updateAcademyRecordsForMatch },
            { processMatchRecognitions },
            { processMatchAI },
          ] = await Promise.all([
            import("@/lib/mc-career-engine"),
            import("@/lib/mc-tournament-engine"),
            import("@/lib/mc-academy-records"),
            import("@/lib/mc-recognition-engine"),
            import("@/lib/mc-ai-engine"),
          ]);
          await Promise.all([updateCareersForMatch(matchId), updateTournamentForMatch(matchId)]);
          const rec = await updateAcademyRecordsForMatch(matchId);
          if (rec.broken.length > 0) toast.success(`Academy record broken: ${rec.broken[0]}`);
          await Promise.all([processMatchRecognitions(matchId), processMatchAI(matchId)]);
        } catch (careerErr) {
          console.error("Background update after finalize failed", careerErr);
        }
      })();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finalize match");
      setBusy(false);
    }
  };

  const outcomes = [
    ["won", "Won"],
    ["tie", "Tied"],
    ["draw", "Draw"],
    ["no_result", "No result"],
    ["abandoned", "Abandoned"],
    ["cancelled", "Cancelled"],
  ] as const;
  const editable = canOverrideResult(role);

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[17px]">
            <Trophy className="size-5 text-amber-500" />
            Finish match
          </DialogTitle>
          <DialogDescription>The match locks after this.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border bg-card px-3.5 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Result
            </div>
            <div className="mt-0.5 text-[17px] font-semibold leading-snug">
              {victoryType === detectedResult.victoryType &&
              winnerTeamId === detectedResult.winnerTeamId
                ? detectedResult.summary
                : victoryType === "won"
                  ? `${winnerTeamId === teamB.id ? teamB.name : teamA.name} won`
                  : (outcomes.find(([v]) => v === victoryType)?.[1] ?? "")}
            </div>
            {editable && !changing && (
              <button
                type="button"
                onClick={() => setChanging(true)}
                className="mt-1 text-[12.5px] font-medium text-primary"
              >
                Change result
              </button>
            )}
          </div>

          {changing && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {outcomes.map(([value, label]) => (
                  <Chip
                    key={value}
                    active={victoryType === value}
                    onClick={() => setVictoryType(value)}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
              {victoryType === "won" && (
                <div className="flex flex-wrap gap-1.5">
                  {[teamA, teamB].map((t) => (
                    <Chip
                      key={t.id}
                      active={winnerTeamId === t.id}
                      onClick={() => setWinnerTeamId(t.id)}
                    >
                      {t.name}
                    </Chip>
                  ))}
                </div>
              )}
              {overridden && (
                <Textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Why? e.g. rain, umpire decision"
                  className="min-h-[60px] text-[16px]"
                />
              )}
            </div>
          )}

          <div>
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Player of the match
            </Label>
            {suggestions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestions.slice(0, 4).map((s) => (
                  <Chip
                    key={`${s.category}-${s.athleteId ?? s.name}`}
                    active={pomName === s.name}
                    onClick={() => {
                      setPomAthleteId(s.athleteId);
                      setPomName(s.name);
                    }}
                  >
                    {s.name}
                  </Chip>
                ))}
              </div>
            )}
            <Input
              value={pomName}
              onChange={(e) => {
                setPomName(e.target.value);
                setPomAthleteId(null);
              }}
              placeholder="Type a name (optional)"
              className="mt-1.5 h-11 text-[16px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={runFinalize} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Lock className="mr-1.5 size-4" /> Finish match
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "h-9 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-accent")
      }
    >
      {children}
    </button>
  );
}

/* ============================================================
 * Unlock dialog (Owner only)
 * ============================================================ */

interface UnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  tenantId: string;
  actorId: string | null;
  role: MCRole;
  onUnlocked?: () => void;
}

export function UnlockMatchDialog({
  open,
  onOpenChange,
  matchId,
  tenantId,
  actorId,
  role,
  onUnlocked,
}: UnlockDialogProps) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!canUnlock(role)) {
      toast.error("Only the Academy Owner can unlock a finalized match");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required");
      return;
    }
    if (!confirm) {
      toast.error("Please confirm you understand this reopens the match");
      return;
    }
    setBusy(true);
    try {
      await unlockMatch({ matchId, tenantId, actorId, reason: reason.trim() });
      // Career Engine: rebuild affected athletes so unlocked match is excluded.
      try {
        const [
          { rebuildCareersAfterUnlock },
          { updateTournamentForMatch },
          { rebuildAcademyRecords },
        ] = await Promise.all([
          import("@/lib/mc-career-engine"),
          import("@/lib/mc-tournament-engine"),
          import("@/lib/mc-academy-records"),
        ]);
        await rebuildCareersAfterUnlock(matchId);
        await updateTournamentForMatch(matchId);
        // Academy Records must be rebuilt (a broken record may need to revert).
        await rebuildAcademyRecords(tenantId);
      } catch (careerErr) {
        console.error("Career rebuild after unlock failed", careerErr);
      }
      toast.success("Match unlocked");
      onUnlocked?.();
      onOpenChange(false);
      setReason("");
      setConfirm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unlock match");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="size-5 text-amber-500" /> Unlock finalized match
          </DialogTitle>
          <DialogDescription>
            The match will be reopened for editing. A full audit log entry will be created with your
            reason.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Scoring error found in over 12 — need to correct wide count"
              className="mt-1"
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="mt-1"
            />
            <span>
              I understand this reopens scoring, undo and XI edits until the match is finalized
              again.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 mr-1.5 animate-spin" /> Unlocking…
              </>
            ) : (
              "Unlock match"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
