import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NumberRoll } from "@/components/ui/number-roll";
import { useSwipe } from "@/hooks/use-swipe";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  ChevronRight,
  CircleDot,
  FileText,
  Flag,
  HeartPulse,
  History,
  ListOrdered,
  MoreHorizontal,
  Redo2,
  StopCircle,
  Undo2,
  UserPlus,
  Share2,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { OverHistorySheet } from "./over-history-sheet";
import type { OverHistoryRow } from "@/lib/mc-statistics-engine";
import { formatBallNotation } from "@/lib/mc-ball-events-core";

import type { BatterStats, BowlerStats, PlayerOption } from "./scoring-ui";

export interface MobileScorerInsight {
  partnership?: string;
  projected?: string;
  lastWicket?: string;
  extras?: string;
  recentOvers?: { label: string; runs: number; wickets: number }[];
}

export interface MobileScorerProps {
  onExit: () => void;
  tournamentLabel?: string;
  matchTitle: string;
  isLive?: boolean;
  /** Next delivery is a free hit (follows a no ball) — only run outs apply. */
  freeHit?: boolean;

  score: string;
  overs: string;
  crr?: string;
  rrr?: string;
  target?: string;
  chase?: { runsNeeded: number; ballsLeft: number } | null;

  striker?: BatterStats;
  nonStriker?: BatterStats;
  bowler?: BowlerStats;
  partnership?: { runs: number; balls: number } | null;
  overBalls: string[];
  currentOverLabel?: string;
  overHistory?: OverHistoryRow[];
  inningsLabel?: string;
  insights?: MobileScorerInsight;

  disabled?: boolean;
  onRun: (r: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  onExtra: (kind: "Wide" | "No Ball" | "Bye" | "Leg Bye") => void;
  onOut: () => void;

  onOpenStrikerPicker: () => void;
  onOpenNonStrikerPicker: () => void;
  onOpenBowlerPicker: () => void;
  battingOptions?: PlayerOption[];
  bowlingOptions?: PlayerOption[];
  onPickPlayer?: (role: PickerKind, p: PlayerOption) => void;
  requiredPicker?: PickerKind | null;
  awaitingNewBatter?: boolean;
  awaitingNewBatterRole?: "striker" | "nonStriker";
  awaitingNewBowler?: boolean;
  previousBowlerName?: string | null;
  previousBowlerId?: string | null;
  bowledBowlerIds?: string[];
  dismissedBatterIds?: string[];
  dismissedBatterNames?: string[];

  onUndo: () => void;
  /** Opens the "fix an earlier ball" list. */
  onFixBall?: () => void;
  /** Bar shown above the scoring buttons while a fix is in progress. */
  fixBar?: ReactNode;
  onRedo?: () => void;
  canRedo?: boolean;
  onSwapStrike: () => void;
  onRetiredHurt: () => void;
  onFinishInnings?: () => void;
  onEndMatch: () => void;
  showFinishInnings?: boolean;
  hideEndMatch?: boolean;

  onOpenScorecard?: () => void;
  /** Opens the screen to fix team names, players and Captain / Vice / Keeper. */
  onEditTeams?: () => void;
  /** Overs per innings; used for the projected score in the first innings. */
  totalOvers?: number | null;
  /** The scorer closed a player list that a tapped ball was waiting for: drop that ball. */
  onPickerDismissed?: () => void;
  /** A new over started and its bowler is not chosen yet. */
  newBowlerNeeded?: boolean;
  onOpenScorebook?: () => void;
  onShareMatch?: () => void;
  scorecardContent?: ReactNode;
}

type PickerKind = "striker" | "nonStriker" | "bowler";

const FOOTER_COLS: Record<number, string> = {
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

export function MobileScorer(props: MobileScorerProps) {
  const [pickerOpen, setPickerOpen] = useState<PickerKind | null>(null);
  const autoPickerRef = useRef<PickerKind | null>(null);
  const [scorecardExpanded, setScorecardExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    kind: "end-match" | "finish-innings" | "delete-ball";
  }>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const sheetPickerEnabled = Boolean(
    props.battingOptions && props.bowlingOptions && props.onPickPlayer,
  );

  const hasActiveStriker = Boolean(props.striker?.name);
  const hasActiveNonStriker = Boolean(props.nonStriker?.name);
  const missingBatterRole: PickerKind | null = !hasActiveStriker
    ? "striker"
    : !hasActiveNonStriker
      ? "nonStriker"
      : null;

  // A tapped ball is waiting for a player (striker, non-striker or bowler): open that list.
  // When one is chosen the page asks for the next missing one, then scores the ball.
  useEffect(() => {
    if (!sheetPickerEnabled || !props.requiredPicker) return;
    autoPickerRef.current = props.requiredPicker;
    setPickerOpen(props.requiredPicker);
  }, [sheetPickerEnabled, props.requiredPicker]);

  useEffect(() => {
    if (props.requiredPicker || !pickerOpen) return;
    if (autoPickerRef.current !== pickerOpen) return;
    autoPickerRef.current = null;
    setPickerOpen(null);
  }, [pickerOpen, props.requiredPicker]);

  // Auto-open the batter picker when a wicket falls and a slot is empty.
  useEffect(() => {
    if (!sheetPickerEnabled) return;
    if (!props.awaitingNewBatter) return;
    if (!missingBatterRole) return;
    // Not marked as "auto": the effect above closes auto-opened lists as soon as no ball is
    // waiting, which used to shut this list the instant it opened.
    autoPickerRef.current = null;
    setPickerOpen(missingBatterRole);
  }, [sheetPickerEnabled, props.awaitingNewBatter, missingBatterRole]);

  // Swipe-to-undo removed: a slip of the thumb while scrolling must never delete a ball. Use the Undo button.
  const swipeHandlers = useSwipe({ threshold: 72 });

  const openPicker = (kind: PickerKind) => {
    if (sheetPickerEnabled) {
      autoPickerRef.current = null;
      setPickerOpen(kind);
      return;
    }
    if (kind === "striker") props.onOpenStrikerPicker();
    else if (kind === "nonStriker") props.onOpenNonStrikerPicker();
    else props.onOpenBowlerPicker();
  };

  const pickerCandidates = useMemo(() => {
    if (!pickerOpen || !sheetPickerEnabled) return [];
    const base =
      pickerOpen === "bowler" ? (props.bowlingOptions ?? []) : (props.battingOptions ?? []);
    if (pickerOpen === "bowler") return base;

    const excluded = new Set<string>();
    const excludedNames = new Set<string>();
    if (pickerOpen === "striker" && props.nonStriker?.name)
      excludedNames.add(props.nonStriker.name);
    if (pickerOpen === "nonStriker" && props.striker?.name) excludedNames.add(props.striker.name);
    // Exclude anyone already dismissed in this innings.
    for (const id of props.dismissedBatterIds ?? []) excluded.add(id);
    for (const name of props.dismissedBatterNames ?? []) excludedNames.add(name);
    return base.filter((p) => !excluded.has(p.id) && !excludedNames.has(p.name));
  }, [
    pickerOpen,
    sheetPickerEnabled,
    props.battingOptions,
    props.bowlingOptions,
    props.striker?.name,
    props.nonStriker?.name,
    props.dismissedBatterIds,
    props.dismissedBatterNames,
  ]);

  const isIllegalBowler = (p: PlayerOption) => {
    if (pickerOpen !== "bowler") return false;
    if (!props.awaitingNewBowler) return false;
    if (props.previousBowlerId && p.id === props.previousBowlerId) return true;
    return Boolean(props.previousBowlerName && p.name === props.previousBowlerName);
  };

  const closeAll = () => {
    setConfirm(null);
  };

  const confirmMeta = (() => {
    if (!confirm) return null;
    if (confirm.kind === "end-match") {
      return {
        title: "End match?",
        description:
          "This finalises the match. This action cannot be undone once the match is locked.",
        action: "End match",
        run: () => {
          closeAll();
          props.onEndMatch();
        },
      };
    }
    if (confirm.kind === "finish-innings") {
      return {
        title: "Finish innings?",
        description:
          "The current innings will be marked complete. You can start the next innings after confirming.",
        action: "Finish innings",
        run: () => {
          closeAll();
          props.onFinishInnings?.();
        },
      };
    }
    return {
      title: "Delete last ball?",
      description:
        "The most recent delivery will be removed and the score will be recomputed from the event log.",
      action: "Delete ball",
      run: () => {
        closeAll();
        props.onUndo();
      },
    };
  })();

  /* ---------- this over / recent overs ---------- */
  const history = props.overHistory ?? [];
  const lastRow = history.length > 0 ? history[history.length - 1] : undefined;
  // Between overs the strip keeps showing the over that just ended until the next ball.
  const stripIsLastOver = Boolean(lastRow?.completed);
  const stripBalls = lastRow ? lastRow.chips : props.overHistory ? [] : props.overBalls;
  const recentOvers = useMemo(
    () => [...history].reverse().slice(lastRow ? 1 : 0),
    [history, lastRow],
  );

  /* ---------- small numbers ---------- */
  const crrNum = Number(props.crr);
  const projected =
    !props.target && props.totalOvers && Number.isFinite(crrNum) && crrNum > 0
      ? String(Math.round(crrNum * props.totalOvers))
      : props.insights?.projected;
  const partnershipText =
    props.insights?.partnership ??
    (props.partnership ? `${props.partnership.runs}(${props.partnership.balls})` : "0(0)");

  const openScorecard = props.scorecardContent
    ? () => setScorecardExpanded(true)
    : props.onOpenScorecard;

  const moreItems: {
    key: string;
    icon: ReactNode;
    label: string;
    hint?: string;
    danger?: boolean;
    run: () => void;
  }[] = [
    // Strike changes by itself on runs, over end and wickets. This is only the manual correction
    // (wrong batter picked as striker, batters crossed before a catch, a short run), so it lives
    // in More, not on the main bar where it could be tapped by mistake.
    ...(hasActiveStriker && hasActiveNonStriker
      ? [
          {
            key: "swap",
            icon: <ArrowLeftRight className="size-[18px]" />,
            label: "Change who is on strike",
            hint: "Only to correct a mistake",
            run: props.onSwapStrike,
          },
        ]
      : []),
    {
      key: "bowler",
      icon: <UserPlus className="size-[18px]" />,
      label: "Change bowler",
      hint: props.bowler?.name,
      run: () => openPicker("bowler"),
    },
    {
      key: "retire",
      icon: <HeartPulse className="size-[18px]" />,
      label: "Retire a batter",
      hint: "Hurt or retired out",
      run: props.onRetiredHurt,
    },
    ...(history.length > 0
      ? [
          {
            key: "overs",
            icon: <ListOrdered className="size-[18px]" />,
            label: "All overs",
            hint: "Ball by ball",
            run: () => setHistoryOpen(true),
          },
        ]
      : []),
    ...(props.onOpenScorebook
      ? [
          {
            key: "book",
            icon: <BookOpen className="size-[18px]" />,
            label: "Official scorebook",
            run: props.onOpenScorebook,
          },
        ]
      : []),
    ...(props.onEditTeams
      ? [
          {
            key: "teams",
            icon: <Users className="size-[18px]" />,
            label: "Edit teams and players",
            hint: "Names, captain, keeper",
            run: props.onEditTeams,
          },
        ]
      : []),
    ...(props.onShareMatch
      ? [
          {
            key: "share",
            icon: <Share2 className="size-[18px]" />,
            label: "Share live score",
            run: props.onShareMatch,
          },
        ]
      : []),
    ...(props.onFinishInnings
      ? [
          {
            key: "finish",
            icon: <Flag className="size-[18px]" />,
            label: "Finish innings",
            hint: "Declare or end early",
            danger: true,
            run: () => setConfirm({ kind: "finish-innings" }),
          },
        ]
      : []),
    ...(!props.hideEndMatch
      ? [
          {
            key: "end",
            icon: <StopCircle className="size-[18px]" />,
            label: "End match",
            danger: true,
            run: () => setConfirm({ kind: "end-match" }),
          },
        ]
      : []),
  ];

  return (
    <div className="scorer-native-page flex min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="z-20 grid h-11 shrink-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-1 border-b border-border/70 bg-card px-1.5">
        <button
          type="button"
          onClick={props.onExit}
          className="grid size-9 place-items-center rounded-lg text-foreground/80 transition duration-100 active:scale-95 active:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 text-left">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-black leading-none tracking-tight">
              {props.matchTitle}
            </span>
            {props.isLive && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wider text-destructive">
                <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
                Live
              </span>
            )}
          </div>
          {props.tournamentLabel && (
            <div className="mt-1 truncate text-[9.5px] font-semibold uppercase leading-none tracking-[0.1em] text-muted-foreground">
              {props.tournamentLabel}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!props.hideEndMatch && (
            <button
              type="button"
              onClick={() => setConfirm({ kind: "end-match" })}
              className="inline-flex h-8 items-center rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 text-[12px] font-bold text-destructive active:scale-95"
            >
              End
            </button>
          )}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="grid size-9 place-items-center rounded-lg text-foreground/80 active:scale-95 active:bg-muted"
            aria-label="More actions"
          >
            <MoreHorizontal className="size-5" />
          </button>
        </div>
      </header>

      <main
        className="scorer-match-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
        {...swipeHandlers}
      >
        <div className="flex min-h-full flex-col gap-1.5 px-2.5 py-2">
          <ScoreCard
            score={props.score}
            overs={props.overs}
            crr={props.crr}
            rrr={props.rrr}
            target={props.target}
            chase={props.chase}
            isFinished={props.hideEndMatch}
            freeHit={props.freeHit}
            projected={projected}
            partnership={partnershipText}
            extras={props.insights?.extras ?? "0"}
            lastWicket={props.insights?.lastWicket ?? "–"}
          />

          <ThisOverStrip
            balls={stripBalls}
            label={
              lastRow
                ? `${stripIsLastOver ? "Last over" : "This over"} · ${lastRow.overLabel}`
                : "This over"
            }
            runs={lastRow?.runs}
            onOpenHistory={history.length > 0 ? () => setHistoryOpen(true) : undefined}
          />

          <section className="overflow-hidden rounded-xl border bg-card">
            <BatterLine batter={props.striker} striker onClick={() => openPicker("striker")} />
            <div className="h-px bg-border/70" />
            <BatterLine batter={props.nonStriker} onClick={() => openPicker("nonStriker")} />
            <div className="h-px bg-border/70" />
            <BowlerLine
              bowler={props.bowler}
              onClick={() => openPicker("bowler")}
              awaiting={Boolean(props.newBowlerNeeded) || !props.bowler?.name}
            />
          </section>

          <RecentOvers rows={recentOvers} onOpen={() => setHistoryOpen(true)} />
        </div>
      </main>

      {/* White runs to the bottom edge; the buttons sit as low as the home bar allows (it needs about 20 px). */}
      <div className="z-20 shrink-0 border-t border-border/70 bg-card pb-[max(calc(env(safe-area-inset-bottom)-14px),4px)]">
        {props.fixBar ? <div className="pt-2">{props.fixBar}</div> : null}
        <div className="px-2 pt-2">
          <ScoringDock
            disabled={props.disabled}
            onRun={props.onRun}
            onExtra={props.onExtra}
            onOut={props.onOut}
          />
        </div>
        <div className={cn("mt-1 grid gap-0.5 px-1", FOOTER_COLS[props.onFixBall ? 5 : 4])}>
          <FooterAction
            icon={<Undo2 className="size-[18px]" />}
            label="Undo"
            onClick={props.onUndo}
          />
          <FooterAction
            icon={<Redo2 className="size-[18px]" />}
            label="Redo"
            onClick={props.onRedo ?? (() => {})}
            disabled={!props.onRedo || !props.canRedo}
          />
          {props.onFixBall && (
            <FooterAction
              icon={<History className="size-[18px]" />}
              label="Fix ball"
              onClick={props.onFixBall}
              disabled={props.disabled}
            />
          )}
          <FooterAction
            icon={<FileText className="size-[18px]" />}
            label="Scorecard"
            onClick={openScorecard ?? (() => {})}
            disabled={!openScorecard}
          />
          <FooterAction
            icon={<MoreHorizontal className="size-[18px]" />}
            label="More"
            onClick={() => setMoreOpen(true)}
          />
        </div>
      </div>

      <PlayerPickerSheet
        open={!!pickerOpen}
        kind={pickerOpen}
        players={pickerCandidates}
        isDisabled={isIllegalBowler}
        onOpenChange={(v) => {
          if (v) return;
          // Closing a list that a tapped ball was waiting for drops that ball, so it can
          // never be scored later by surprise.
          if (pickerOpen && pickerOpen === props.requiredPicker) props.onPickerDismissed?.();
          autoPickerRef.current = null;
          setPickerOpen(null);
        }}
        lockedMessage={pickerOpen === "bowler" ? "Cannot bowl consecutive overs" : undefined}
        bowledIds={pickerOpen === "bowler" ? (props.bowledBowlerIds ?? []) : []}
        onSelect={(p) => {
          if (!pickerOpen || isIllegalBowler(p)) return;
          props.onPickPlayer?.(pickerOpen, p);
          autoPickerRef.current = null;
          setPickerOpen(null);
        }}
      />

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl p-0 pb-[var(--app-safe-bottom)]">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="text-base">More actions</SheetTitle>
          </SheetHeader>
          <ul className="max-h-[70dvh] divide-y divide-border/60 overflow-y-auto">
            {moreItems.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    item.run();
                  }}
                  className={cn(
                    "grid h-12 w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 px-4 text-left active:bg-muted",
                    item.danger && "text-destructive",
                  )}
                >
                  <span aria-hidden>{item.icon}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold leading-tight">
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                        {item.hint}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <Sheet open={scorecardExpanded} onOpenChange={setScorecardExpanded}>
        <SheetContent
          side="bottom"
          className="flex h-[88dvh] flex-col gap-0 rounded-t-2xl p-0 pb-[var(--app-safe-bottom)]"
        >
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="text-base">Scorecard</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">{props.scorecardContent}</div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          {confirmMeta && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmMeta.title}</AlertDialogTitle>
                <AlertDialogDescription>{confirmMeta.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={confirmMeta.run}
                >
                  {confirmMeta.action}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <OverHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        rows={props.overHistory ?? []}
        inningsLabel={props.inningsLabel}
      />
    </div>
  );
}

/** Score, run rates and the four small numbers, all in one card. */
function ScoreCard({
  score,
  overs,
  crr,
  rrr,
  target,
  chase,
  isFinished,
  freeHit,
  projected,
  partnership,
  extras,
  lastWicket,
}: {
  score: string;
  overs: string;
  crr?: string;
  rrr?: string;
  target?: string;
  chase?: { runsNeeded: number; ballsLeft: number } | null;
  isFinished?: boolean;
  freeHit?: boolean;
  projected?: string;
  partnership: string;
  extras: string;
  lastWicket: string;
}) {
  const [runsPart, wicketsPart] = score.split("/");
  const wickets = wicketsPart ?? "0";
  return (
    <section className="shrink-0 overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
        <div className="flex min-w-0 items-end gap-2">
          <h1 className="text-[38px] font-black leading-[0.9] tracking-tight tabular-nums">
            <NumberRoll value={`${runsPart ?? score}/${wickets}`} />
          </h1>
          <span className="mb-0.5 shrink-0 text-[12px] font-bold tabular-nums text-muted-foreground">
            {overs.startsWith("Over ") ? overs : `${overs} ov`}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 text-right tabular-nums">
          {isFinished ? (
            <span className="rounded-md bg-amber-500/15 px-2 py-1 text-[11px] font-black uppercase tracking-tight text-amber-600 dark:text-amber-400">
              Match finished
            </span>
          ) : freeHit ? (
            <span className="rounded-md bg-amber-500/20 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Free hit
            </span>
          ) : chase ? (
            <span className="rounded-md bg-[color-mix(in_oklab,var(--score-success-fg)_14%,transparent)] px-2 py-1 text-[12px] font-black text-[var(--score-success-fg)]">
              Need {chase.runsNeeded} off {chase.ballsLeft}
            </span>
          ) : null}
          {target && (
            <span className="text-[11px] font-bold text-muted-foreground">
              Target <span className="font-black text-foreground">{target}</span>
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-5 divide-x divide-border/60 border-t border-border/60 bg-muted/30">
        <Stat label="CRR" value={crr ?? "–"} />
        {rrr ? (
          <Stat label="RRR" value={rrr} accent />
        ) : (
          <Stat label="Proj" value={projected ?? "–"} />
        )}
        <Stat label="P'ship" value={partnership} />
        <Stat label="Extras" value={extras} />
        <Stat label="Last wkt" value={lastWicket} />
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 px-1 py-1 text-center tabular-nums">
      <div className="truncate text-[8.5px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "truncate text-[12.5px] font-black leading-tight",
          accent && "text-[var(--score-success-fg)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function BatterLine({
  batter,
  striker,
  onClick,
}: {
  batter?: BatterStats;
  striker?: boolean;
  onClick: () => void;
}) {
  const empty = !batter?.name;
  const name = batter?.name ?? (striker ? "Select striker" : "Select non-striker");
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative grid h-11 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 pl-3 pr-3 text-left transition duration-100 active:bg-muted/70",
        striker && !empty && "bg-[var(--score-striker-bg)]",
        empty && "bg-[var(--score-wait-bg)]",
      )}
    >
      {striker && !empty && (
        <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-primary" />
      )}
      <span className="flex min-w-0 items-baseline gap-1">
        <span
          className={cn(
            "truncate text-[14px] leading-tight",
            empty ? "font-semibold text-primary" : "font-bold",
          )}
        >
          {name}
        </span>
        {striker && !empty && (
          <span className="shrink-0 text-[14px] font-black text-primary" title="On strike">
            *
          </span>
        )}
      </span>
      <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
        {empty
          ? "Tap to choose"
          : `${batter?.fours ?? 0}×4 ${batter?.sixes ?? 0}×6 · SR ${Math.round(Number(batter?.strikeRate ?? 0)) || 0}`}
      </span>
      <span className="w-[62px] shrink-0 text-right tabular-nums">
        <span className="text-[18px] font-black leading-none">{batter?.runs ?? 0}</span>
        <span className="ml-0.5 text-[11.5px] font-bold text-muted-foreground">
          ({batter?.balls ?? 0})
        </span>
      </span>
    </button>
  );
}

function BowlerLine({
  bowler,
  onClick,
  awaiting,
}: {
  bowler?: BowlerStats;
  onClick: () => void;
  awaiting?: boolean;
}) {
  const showAwaiting = Boolean(awaiting);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-live="polite"
      className={cn(
        "grid h-10 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 px-3 text-left transition duration-100 active:bg-muted/70",
        showAwaiting ? "bg-sky-500/10" : "bg-muted/25",
      )}
    >
      <span
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-full bg-[var(--score-bowler-bg)] text-[var(--score-bowler-fg)]",
          showAwaiting && "bg-sky-500/25 text-sky-600 dark:text-sky-300",
        )}
      >
        <CircleDot className="size-3" strokeWidth={2.25} />
      </span>
      <span
        className={cn(
          "truncate text-[13.5px] font-bold",
          showAwaiting && "text-sky-700 dark:text-sky-300",
        )}
      >
        {showAwaiting ? "Choose bowler for this over" : (bowler?.name ?? "Choose bowler")}
      </span>
      <span className="shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-muted-foreground">
        {showAwaiting ? (
          "Tap to choose"
        ) : (
          <>
            <span className="text-[13px] font-black text-foreground">
              {bowler?.wickets ?? 0}/{bowler?.runs ?? 0}
            </span>
            <span>
              {" "}
              ({bowler?.overs ?? "0"}) · Econ {bowler?.economy ?? "–"}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

/** Balls of the over being bowled (or the one that just ended), newest kept in view. */
function ThisOverStrip({
  balls,
  label,
  runs,
  onOpenHistory,
}: {
  balls: string[];
  label: string;
  runs?: number;
  onOpenHistory?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [balls.length]);
  const clickable = Boolean(onOpenHistory);
  return (
    <button
      type="button"
      disabled={!clickable}
      aria-label={clickable ? "Open all overs" : undefined}
      onClick={onOpenHistory}
      className="grid h-10 w-full shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border bg-card px-3 text-left transition duration-100 enabled:active:bg-muted/70"
    >
      <span className="text-[9.5px] font-black uppercase leading-none tracking-wider text-muted-foreground">
        {label}
      </span>
      <div
        ref={scrollRef}
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {balls.length === 0 ? (
          <span className="text-[12px] text-muted-foreground">No ball bowled yet</span>
        ) : (
          balls.map((ball, i) => <BallBubble key={`${ball}-${i}`} label={ball} />)
        )}
      </div>
      {runs != null && (
        <span className="shrink-0 text-[12px] font-black tabular-nums">
          = {runs}
          {clickable && (
            <ChevronRight className="-mr-1 ml-0.5 inline size-3.5 text-muted-foreground" />
          )}
        </span>
      )}
    </button>
  );
}

/** Earlier overs, newest first. Fills whatever height is left above the scoring keys. */
function RecentOvers({ rows, onOpen }: { rows: OverHistoryRow[]; onOpen: () => void }) {
  if (rows.length === 0) return <div className="min-h-0 flex-1" />;
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
      <ul className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.overNumber}>
            <button
              type="button"
              onClick={onOpen}
              className="grid h-9 w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2 px-3 text-left active:bg-muted/70"
            >
              <span className="text-[10.5px] font-black uppercase tracking-wide text-muted-foreground">
                Ov {row.overLabel}
              </span>
              {/* A long over (wides, no-balls) slides sideways under the finger; nothing is cut off. */}
              <span className="flex min-w-0 touch-pan-x items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {row.chips.map((chip, i) => (
                  <BallBubble key={`${chip}-${i}`} label={chip} small />
                ))}
              </span>
              <span className="shrink-0 text-right text-[11.5px] font-bold tabular-nums text-muted-foreground">
                <span className="font-black text-foreground">{row.runs}</span>
                {row.wickets > 0 && <span className="text-destructive"> · {row.wickets}W</span>}
                <span className="ml-1.5">{row.runningScore}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BallBubble({ label, small }: { label: string; small?: boolean }) {
  const upper = formatBallNotation(label);

  const wicket = /W(?!D)/.test(upper);
  const four =
    upper === "4" || upper.endsWith("+4") || (upper.startsWith("NB") && upper.endsWith("5"));
  const six =
    upper === "6" || upper.endsWith("+6") || (upper.startsWith("NB") && upper.endsWith("7"));
  const extra = /WD|NB|LB|B/.test(upper);
  const isMulti = upper.length > 1;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-black tabular-nums leading-none",
        small ? "h-5" : "h-6",
        isMulti
          ? cn("px-1.5", small ? "min-w-5 text-[9px]" : "min-w-6 text-[10px]")
          : small
            ? "w-5 text-[10px]"
            : "w-6 text-[11px]",
        wicket && "bg-destructive text-destructive-foreground",
        four && !wicket && "bg-[var(--score-four)] text-[var(--score-action-foreground)]",
        six && !wicket && "bg-[var(--score-six)] text-[var(--score-action-foreground)]",
        extra &&
          !four &&
          !six &&
          !wicket &&
          "bg-[var(--score-extra-bg)] text-[var(--score-extra-fg)]",
        !wicket && !four && !six && !extra && "bg-muted text-foreground",
      )}
    >
      {upper}
    </span>
  );
}

function ScoringDock({
  disabled,
  onRun,
  onExtra,
  onOut,
}: {
  disabled?: boolean;
  onRun: (r: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void;
  onExtra: (kind: "Wide" | "No Ball" | "Bye" | "Leg Bye") => void;
  onOut: () => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {([0, 1, 2, 3, 4, 5, 6] as const).map((run) => (
          <RunKey key={run} value={run} disabled={disabled} onClick={() => onRun(run)} />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5">
        <ExtraKey label="Wide" tone="wide" disabled={disabled} onClick={() => onExtra("Wide")} />
        <ExtraKey
          label="No ball"
          tone="nb"
          disabled={disabled}
          onClick={() => onExtra("No Ball")}
        />
        <ExtraKey label="Bye" tone="bye" disabled={disabled} onClick={() => onExtra("Bye")} />
        <ExtraKey
          label="Leg bye"
          tone="lb"
          disabled={disabled}
          onClick={() => onExtra("Leg Bye")}
        />
        <ExtraKey label="OUT" tone="out" disabled={disabled} onClick={onOut} />
      </div>
    </div>
  );
}

function RunKey({
  value,
  disabled,
  onClick,
}: {
  value: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-[52px] w-full place-items-center rounded-xl border text-[24px] font-black tabular-nums transition duration-100 active:scale-[0.95] disabled:opacity-40",
        value === 4
          ? "border-transparent bg-[var(--score-four)] text-[var(--score-action-foreground)]"
          : value === 6
            ? "border-transparent bg-[var(--score-six)] text-[var(--score-action-foreground)]"
            : "border-border/80 bg-background text-foreground active:bg-muted",
      )}
    >
      {value === 0 ? "•" : value}
    </button>
  );
}

function ExtraKey({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: "wide" | "nb" | "bye" | "lb" | "out";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-11 w-full place-items-center rounded-xl border px-0.5 text-[12.5px] font-black leading-none tracking-tight transition duration-100 active:scale-[0.95] disabled:opacity-40",
        tone === "wide" &&
          "border-[var(--score-wide-border)] bg-[var(--score-wide-bg)] text-[var(--score-wide-fg)]",
        tone === "nb" &&
          "border-[var(--score-nb-border)] bg-[var(--score-nb-bg)] text-[var(--score-nb-fg)]",
        tone === "bye" &&
          "border-[var(--score-bye-border)] bg-[var(--score-bye-bg)] text-[var(--score-bye-fg)]",
        tone === "lb" &&
          "border-[var(--score-lb-border)] bg-[var(--score-lb-bg)] text-[var(--score-lb-fg)]",
        tone === "out" && "border-transparent bg-destructive text-destructive-foreground",
      )}
    >
      {label}
    </button>
  );
}

function PlayerPickerSheet({
  open,
  kind,
  players,
  onOpenChange,
  onSelect,
  isDisabled,
  lockedMessage,
  bowledIds,
}: {
  open: boolean;
  kind: PickerKind | null;
  players: PlayerOption[];
  onOpenChange: (v: boolean) => void;
  onSelect: (p: PlayerOption) => void;
  isDisabled: (p: PlayerOption) => boolean;
  lockedMessage?: string;
  bowledIds?: string[];
}) {
  const title =
    kind === "bowler"
      ? "Select bowler"
      : kind === "nonStriker"
        ? "Select non-striker"
        : "Select striker";
  const bowledSet = useMemo(() => new Set(bowledIds ?? []), [bowledIds]);
  const groups = useMemo(() => {
    if (kind !== "bowler" || bowledSet.size === 0) {
      return [{ label: "", items: players }];
    }
    const already: PlayerOption[] = [];
    const rest: PlayerOption[] = [];
    for (const p of players) (bowledSet.has(p.id) ? already : rest).push(p);
    return [
      { label: "Already bowled", items: already },
      { label: "Yet to bowl", items: rest },
    ];
  }, [players, bowledSet, kind]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[calc(100vw-1.5rem)] max-w-md gap-0 overflow-hidden rounded-2xl bg-card p-0 sm:max-w-md"
      >
        <DialogHeader className="border-b border-border/70 px-4 pb-3 pt-4 text-left">
          <DialogTitle className="text-base font-black">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Tap a player to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60dvh] overflow-y-auto">
          {players.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No players found.
            </div>
          ) : (
            groups.map((group, gi) =>
              group.items.length === 0 ? null : (
                <div
                  key={group.label || `g-${gi}`}
                  className="border-b border-border/70 last:border-b-0"
                >
                  {group.label && (
                    <div className="sticky top-0 z-10 border-b border-border/70 bg-card px-4 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {group.label}
                      <span className="ml-1 text-muted-foreground/60">({group.items.length})</span>
                    </div>
                  )}
                  <ul className="divide-y divide-border/60">
                    {group.items.map((player) => {
                      const locked = isDisabled(player);
                      const bowled = bowledSet.has(player.id);
                      return (
                        <li key={player.id}>
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => onSelect(player)}
                            className="grid h-12 w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 text-left transition duration-100 active:bg-muted disabled:opacity-45"
                          >
                            <span className="grid size-9 place-items-center rounded-full bg-muted text-[12px] font-black text-foreground/80">
                              {initials(player.name)}
                            </span>
                            <span className="min-w-0">
                              <span
                                className={cn(
                                  "block truncate text-[14px] leading-tight",
                                  bowled ? "font-semibold text-muted-foreground" : "font-bold",
                                )}
                              >
                                {player.name}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground empty:hidden">
                                {locked
                                  ? lockedMessage
                                  : bowled
                                    ? "Bowled earlier · Tap to continue"
                                    : player.role && player.role !== "Player"
                                      ? player.role
                                      : ""}
                              </span>
                            </span>
                            {locked && (
                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Locked
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ),
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FooterAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="grid h-11 w-full grid-rows-[auto_auto] place-content-center place-items-center gap-0.5 rounded-lg text-foreground/85 transition duration-100 active:scale-[0.97] active:bg-muted disabled:opacity-35"
    >
      <span aria-hidden>{icon}</span>
      <span className="text-[10.5px] font-bold leading-none">{label}</span>
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}
