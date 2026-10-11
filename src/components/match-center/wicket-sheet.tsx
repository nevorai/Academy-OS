import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DismissalType } from "@/lib/mc-ball-events-core";
import type { PlayerOption } from "@/components/match-center/scoring-ui";
import {
  buildWicketBall,
  canChooseWhoIsOut,
  deliveriesAllowedFor,
  isNonDeliveryKind,
  needsFielder,
  takesRuns,
  type DeliveryKind,
  type RunsCredit,
  type WicketBallPartial,
} from "@/lib/mc-wicket-ball";

/* ================================================================
 * Wicket sheet — one place to record any wicket.
 * The wicket, the runs the batters completed, and a wide or no-ball are all
 * saved as ONE ball, so the total, the over count and the strike stay right.
 * ================================================================ */

const KINDS: { kind: DismissalType; label: string }[] = [
  { kind: "bowled", label: "Bowled" },
  { kind: "caught", label: "Catch" },
  { kind: "lbw", label: "LBW" },
  { kind: "run_out", label: "Run out" },
  { kind: "stumped", label: "Stumped" },
  { kind: "hit_wicket", label: "Hit wicket" },
  { kind: "obstructing_field", label: "Obstructing" },
  { kind: "hit_ball_twice", label: "Hit twice" },
  { kind: "retired_hurt", label: "Retired hurt" },
  { kind: "retired_out", label: "Retired out" },
  { kind: "timed_out", label: "Timed out" },
];

const DELIVERY_LABEL: Record<DeliveryKind, string> = {
  legal: "Normal ball",
  wide: "Wide",
  no_ball: "No ball",
};

export interface WicketSheetResult {
  kind: DismissalType;
  partial: WicketBallPartial;
  dismissed: "striker" | "non-striker";
  fielder: PlayerOption | null;
  /** Run out only: the batters had crossed before the wicket fell. */
  crossed: boolean;
}

function Chip({
  active,
  disabled,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-11 rounded-xl border px-2 text-[13px] font-semibold transition active:scale-[0.98]",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-muted",
        disabled && "pointer-events-none opacity-35",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

export function WicketSheet({
  open,
  onOpenChange,
  initialKind,
  strikerName,
  nonStrikerName,
  fielders,
  freeHit,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Open with this dismissal already chosen (e.g. the Retired button). */
  initialKind?: DismissalType | null;
  strikerName: string | null;
  nonStrikerName: string | null;
  /** Players of the fielding side, for catches, stumpings and run outs. */
  fielders: PlayerOption[];
  freeHit: boolean;
  onConfirm: (result: WicketSheetResult) => void;
}) {
  const [kind, setKind] = useState<DismissalType | null>(null);
  const [delivery, setDelivery] = useState<DeliveryKind>("legal");
  const [who, setWho] = useState<"striker" | "non-striker">("striker");
  const [runs, setRuns] = useState(0);
  const [credit, setCredit] = useState<RunsCredit>("bat");
  const [fielder, setFielder] = useState<PlayerOption | null>(null);
  const [crossed, setCrossed] = useState(false);

  // Fresh form every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setKind(initialKind ?? null);
    setDelivery("legal");
    setWho("striker");
    setRuns(0);
    setCredit("bat");
    setFielder(null);
    setCrossed(false);
  }, [open, initialKind]);

  const allowed = useMemo(() => (kind ? deliveriesAllowedFor(kind, freeHit) : []), [kind, freeHit]);

  const pickKind = (k: DismissalType) => {
    setKind(k);
    setRuns(0);
    setCredit("bat");
    setCrossed(false);
    setFielder(null);
    const ok = deliveriesAllowedFor(k, freeHit);
    setDelivery(ok.includes("legal") ? "legal" : (ok[0] ?? "legal"));
    // A stumping is the keeper's: pre-select him.
    if (k === "stumped") setFielder(fielders.find((f) => f.isKeeper) ?? null);
  };

  const showFielder = kind ? needsFielder(kind) || kind === "run_out" : false;
  const fielderMissing = kind ? (kind === "caught" || kind === "stumped") && !fielder : false;
  const canConfirm = Boolean(kind) && allowed.length > 0 && !fielderMissing;

  const confirm = () => {
    if (!kind || !canConfirm) return;
    const partial = buildWicketBall({ kind, delivery, runs, credit });
    onConfirm({
      kind,
      partial,
      dismissed: canChooseWhoIsOut(kind) ? who : "striker",
      fielder: showFielder ? fielder : null,
      crossed: kind === "run_out" && crossed,
    });
  };

  const nonDelivery = kind ? isNonDeliveryKind(kind) : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        overlayClassName="bg-background/35 backdrop-blur-[1px]"
        className="flex max-h-[92dvh] flex-col rounded-t-3xl bg-card/95 p-0 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <div className="min-w-0 pr-2 text-left">
            <SheetTitle className="text-base">Wicket</SheetTitle>
            <SheetDescription className="text-xs">
              Pick how the batter is out. Add the runs and any wide or no-ball in the same step.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-full">
              <X className="size-4" />
            </Button>
          </SheetClose>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3">
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <Chip
                key={k.kind}
                active={kind === k.kind}
                onClick={() => pickKind(k.kind)}
                className="h-10 text-[12px]"
              >
                {k.label}
              </Chip>
            ))}
          </div>

          {kind && (
            <>
              {!nonDelivery && (
                <Section title="On this ball">
                  <div className="grid grid-cols-3 gap-2">
                    {(["legal", "wide", "no_ball"] as DeliveryKind[]).map((d) => (
                      <Chip
                        key={d}
                        active={delivery === d}
                        disabled={!allowed.includes(d)}
                        onClick={() => setDelivery(d)}
                      >
                        {DELIVERY_LABEL[d]}
                      </Chip>
                    ))}
                  </div>
                  {freeHit && (
                    <p className="text-[11px] text-muted-foreground">
                      Free hit: only a run out, obstructing the field or hitting the ball twice.
                    </p>
                  )}
                </Section>
              )}

              {canChooseWhoIsOut(kind) && (
                <Section title="Who is out">
                  <div className="grid grid-cols-2 gap-2">
                    <Chip active={who === "striker"} onClick={() => setWho("striker")}>
                      <span className="block truncate">{strikerName || "Striker"}</span>
                      <span className="block text-[10px] font-normal opacity-70">on strike</span>
                    </Chip>
                    <Chip active={who === "non-striker"} onClick={() => setWho("non-striker")}>
                      <span className="block truncate">{nonStrikerName || "Non-striker"}</span>
                      <span className="block text-[10px] font-normal opacity-70">other end</span>
                    </Chip>
                  </div>
                </Section>
              )}

              {takesRuns(kind) && (
                <Section title="Runs completed before the wicket">
                  <div className="grid grid-cols-7 gap-1.5">
                    {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                      <Chip
                        key={n}
                        active={runs === n}
                        onClick={() => setRuns(n)}
                        className="h-10 px-0"
                      >
                        {n}
                      </Chip>
                    ))}
                  </div>
                  {runs > 0 && delivery !== "wide" && (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {(
                        [
                          ["bat", "Off the bat"],
                          ["bye", "Byes"],
                          ["leg_bye", "Leg byes"],
                        ] as [RunsCredit, string][]
                      ).map(([c, label]) => (
                        <Chip
                          key={c}
                          active={credit === c}
                          onClick={() => setCredit(c)}
                          className="h-9 text-[12px]"
                        >
                          {label}
                        </Chip>
                      ))}
                    </div>
                  )}
                  {delivery === "wide" && runs > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Runs off a wide all count as wides.
                    </p>
                  )}
                </Section>
              )}

              {kind === "run_out" && (
                <Section title="Had the batters crossed?">
                  <div className="grid grid-cols-2 gap-2">
                    <Chip active={!crossed} onClick={() => setCrossed(false)}>
                      No
                    </Chip>
                    <Chip active={crossed} onClick={() => setCrossed(true)}>
                      Yes, they crossed
                    </Chip>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    This decides who faces the next ball. You can still swap strike afterwards.
                  </p>
                </Section>
              )}

              {showFielder && (
                <Section
                  title={
                    kind === "caught"
                      ? "Who took the catch"
                      : kind === "stumped"
                        ? "Wicket-keeper"
                        : "Fielder (optional)"
                  }
                >
                  <div className="grid grid-cols-2 gap-2">
                    {fielders.map((f) => (
                      <Chip
                        key={f.id}
                        active={fielder?.id === f.id}
                        onClick={() => setFielder(fielder?.id === f.id ? null : f)}
                        className="h-10 text-[12px]"
                      >
                        <span className="block truncate">{f.name}</span>
                      </Chip>
                    ))}
                    {fielders.length === 0 && (
                      <p className="col-span-2 text-xs text-muted-foreground">
                        No fielding side listed for this match.
                      </p>
                    )}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>

        <div
          className="border-t border-border/60 px-3 pt-3"
          style={{ paddingBottom: "calc(var(--app-safe-bottom) + .75rem)" }}
        >
          <Button className="h-12 w-full text-sm font-bold" disabled={!canConfirm} onClick={confirm}>
            {kind ? "Record wicket" : "Choose how the batter is out"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
