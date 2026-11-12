import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Radio, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { matchFeedKeys, type MatchWithTeams } from "@/lib/match-feeds";
import { appendTimelineEvent, detectMatchResult, finalizeMatch } from "@/lib/mc-finalization";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const dismissKey = (matchId: string) => `academyos.live-banner-dismissed.${matchId}`;

function wasDismissed(matchId: string): boolean {
  try {
    return window.localStorage.getItem(dismissKey(matchId)) === "1";
  } catch {
    return false;
  }
}

/**
 * The "live match" strip on Home. Three things in one place:
 *  - tap the strip to score,
 *  - X hides it on this phone for this match (nothing is changed in the match),
 *  - "End" closes the match for everyone, after a confirmation. Owners and admins only.
 */
export function LiveMatchStrip({
  match,
  tenantId,
  canEnd,
}: {
  match: MatchWithTeams;
  tenantId: string;
  canEnd: boolean;
}) {
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(() => wasDismissed(match.id));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const a = match.team_a?.short_name ?? match.team_a?.name ?? "Team A";
  const b = match.team_b?.short_name ?? match.team_b?.name ?? "Team B";

  if (hidden) return null;

  const hide = () => {
    try {
      window.localStorage.setItem(dismissKey(match.id), "1");
    } catch {
      /* hidden for this visit only */
    }
    setHidden(true);
  };

  const endMatch = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const actorId = data.user?.id ?? null;
      // A quick end closes the match with no result ("abandoned"): right for a match that was left running or started by mistake.
      const result = detectMatchResult([], {
        matchStatus: "abandoned",
        teamAId: match.team_a_id,
        teamBId: match.team_b_id,
      });
      await finalizeMatch({
        matchId: match.id,
        tenantId,
        actorId,
        result,
        playerOfMatchAthleteId: null,
      });
      await appendTimelineEvent({
        tenantId,
        matchId: match.id,
        eventType: "match_finalized",
        label: "Ended from Home (quick end)",
        payload: { quickEnd: true },
      }).catch(() => undefined);
      toast.success("Match ended");
      setConfirm(false);
      await qc.invalidateQueries({ queryKey: matchFeedKeys.all(tenantId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not end the match");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "flex items-stretch gap-1 rounded-[7px] border border-t-2 border-border border-t-red-500 bg-card",
        )}
      >
        <Link
          to="/scorer/$matchId"
          params={{ matchId: match.id }}
          className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5"
          aria-label={`Live match ${a} versus ${b}: open scoring`}
        >
          <span className="relative inline-flex size-2.5 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-70" />
            <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
              Live now
            </span>
            <span className="block truncate text-sm font-semibold tracking-tight">
              {a} vs {b} · Tap to score
            </span>
          </span>
          <Radio className="ml-auto size-4 shrink-0 text-red-500" aria-hidden />
        </Link>
        {canEnd ? (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="my-1.5 shrink-0 rounded-lg border border-border px-3 text-sm font-semibold active:scale-95"
          >
            End
          </button>
        ) : null}
        <button
          type="button"
          onClick={hide}
          aria-label="Hide this banner"
          className="grid w-11 shrink-0 place-items-center text-muted-foreground active:scale-95"
        >
          <X className="size-5" />
        </button>
      </div>

      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              End {a} vs {b}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The match closes for everyone and is saved as "abandoned" (no result). Use this for a
              match that was left running or started by mistake. To finish a real match with its
              result, open the scorer instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it live</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void endMatch();
              }}
            >
              {busy ? "Ending…" : "End match"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
