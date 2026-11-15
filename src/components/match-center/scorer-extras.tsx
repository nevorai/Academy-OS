import { useState } from "react";
import { toast } from "sonner";
import { ballHelpers } from "@/hooks/use-scoring-session";
import { ByeRunsPopup, ExtraDeliveryPopup } from "@/components/match-center/dial-popup";

/**
 * Wide / No ball / Bye / Leg bye entry, shared by the live scorer and the demo
 * scorer so a fix is made in ONE place. Tap = saved at once; hold (or right
 * click) = popup for extra runs. The wide and no-ball penalty run is added
 * here, never by the scorer.
 */
export type ExtraKind = "Wide" | "No Ball" | "Bye" | "Leg Bye";
type Partial = ReturnType<
  | typeof ballHelpers.run
  | typeof ballHelpers.wide
  | typeof ballHelpers.noBall
  | typeof ballHelpers.bye
  | typeof ballHelpers.legBye
>;

export function useExtraEntry({
  requestSubmit,
  openWicket,
}: {
  requestSubmit: (partial: Partial) => void;
  openWicket: () => void;
}) {
  const [extraKind, setExtraKind] = useState<ExtraKind | null>(null);

  /** One tap on Wide or No ball: saved at once, no extra runs. */
  const quickExtra = (kind: "Wide" | "No Ball") => {
    requestSubmit(kind === "Wide" ? ballHelpers.wide(1) : ballHelpers.noBall(0, 0));
    toast.success(kind === "Wide" ? "Wide added (+1)" : "No ball added (+1)", { duration: 1500 });
  };

  /** From the bubble above the key: the penalty run plus the extra runs tapped. */
  const submitExtra = (kind: "Wide" | "No Ball", mode: "bat" | "bye" | "leg_bye", runs: number) => {
    if (kind === "Wide") requestSubmit(ballHelpers.wide(1 + runs));
    else
      requestSubmit(
        mode === "bat"
          ? ballHelpers.noBall(runs, 0)
          : ballHelpers.noBall(0, runs, mode === "leg_bye"),
      );
  };

  const extrasModals = (
    <>
      <ByeRunsPopup
        open={extraKind === "Bye" || extraKind === "Leg Bye"}
        onOpenChange={(v) => !v && setExtraKind(null)}
        kind={extraKind ?? ""}
        onSelect={(runs) => {
          const kind = extraKind;
          setExtraKind(null);
          if (kind === "Bye") requestSubmit(ballHelpers.bye(runs));
          else if (kind === "Leg Bye") requestSubmit(ballHelpers.legBye(runs));
        }}
      />
      <ExtraDeliveryPopup
        open={extraKind === "No Ball" || extraKind === "Wide"}
        onOpenChange={(v) => !v && setExtraKind(null)}
        kind={extraKind === "Wide" ? "Wide" : "No Ball"}
        onSubmit={(mode, runs) => {
          const k = extraKind;
          setExtraKind(null);
          if (k === "Wide") requestSubmit(ballHelpers.wide(1 + runs));
          else
            requestSubmit(
              mode === "bat"
                ? ballHelpers.noBall(runs, 0)
                : ballHelpers.noBall(0, runs, mode === "leg_bye"),
            );
        }}
        onWicket={() => {
          setExtraKind(null);
          openWicket();
        }}
      />
    </>
  );

  return { extraKind, setExtraKind, quickExtra, submitExtra, extrasModals };
}
