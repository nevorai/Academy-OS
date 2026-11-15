import { useState } from "react";
import { toast } from "sonner";
import { ballHelpers, extraDeliveryInput } from "@/lib/mc-scoring-core";
import { ByeRunsPopup, ExtraDeliveryPopup } from "@/components/match-center/dial-popup";

/**
 * Wide / No ball / Bye / Leg bye entry, shared by the live scorer and the demo
 * scorer so a fix is made in ONE place. Wide / No ball: tap = saved at once,
 * hold (or right click) = bubble for extra runs. Bye / Leg bye: tap = the same
 * bubble above the key, tap the runs. The wide and no-ball penalty run is added
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
    requestSubmit(extraDeliveryInput(kind, mode, runs));
  };

  /** From the bubble above Bye or Leg bye: one tap on the runs saves the ball. */
  const submitBye = (kind: "Bye" | "Leg Bye", runs: number) => {
    requestSubmit(kind === "Bye" ? ballHelpers.bye(runs) : ballHelpers.legBye(runs));
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
          if (k) requestSubmit(extraDeliveryInput(k === "Wide" ? "Wide" : "No Ball", mode, runs));
        }}
        onWicket={() => {
          setExtraKind(null);
          openWicket();
        }}
      />
    </>
  );

  return { extraKind, setExtraKind, quickExtra, submitExtra, submitBye, extrasModals };
}
