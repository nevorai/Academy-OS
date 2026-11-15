import { useEffect, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/**
 * The house popup for "pick a number" moments in the scorer (Adarsh's pick,
 * 2026-11-15): a small centred card, round dial keys, a chip that says what is
 * already counted, one clear main button, and Wicket / Cancel pills. It is only
 * as tall as its content: no empty space above the title or under Cancel.
 * Use this for every new run-entry popup so they all look and work the same.
 */
export interface DialKey {
  /** Big text in the circle, e.g. "+1" or "4". */
  label: string;
  /** Small word under the number, e.g. "run", "Four". */
  caption?: string;
  tint?: "blue" | "violet";
  onPress: () => void;
}

function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* haptics are optional */
  }
}

export function DialPopup({
  open,
  onOpenChange,
  title,
  chip,
  accent = "#FF7A1F",
  main,
  keys,
  children,
  onWicket,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  /** Short green/amber pill beside the title, e.g. "+1 added". */
  chip?: string;
  accent?: string;
  /** The one clear main choice, e.g. "Only the no-ball". */
  main?: { label: string; onPress: () => void };
  keys: DialKey[];
  /** Extra controls between the keys and the footer (a segmented switch). */
  children?: ReactNode;
  onWicket?: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-40px)] max-w-[340px] -translate-x-1/2 -translate-y-1/2 select-none rounded-[30px] bg-card p-4 text-center shadow-[0_28px_70px_rgba(0,0,0,0.3)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out"
        >
          <div className="mb-3 flex items-center justify-center gap-2">
            <DialogPrimitive.Title className="text-[20px] font-extrabold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            {chip && (
              <span
                className="rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                style={{ background: `${accent}26`, color: accent }}
              >
                {chip}
              </span>
            )}
          </div>

          {main && (
            <button
              type="button"
              onClick={() => {
                buzz(8);
                main.onPress();
              }}
              className="mb-3 h-[50px] w-full rounded-2xl text-[16px] font-bold text-white transition active:scale-[0.97]"
              style={{
                background: `linear-gradient(180deg, ${accent}E6, ${accent})`,
                boxShadow: `0 6px 16px ${accent}59`,
              }}
            >
              {main.label}
            </button>
          )}

          <div className="mb-3 grid grid-cols-3 justify-items-center gap-x-3 gap-y-2.5">
            {keys.map((k) => (
              <button
                key={k.label}
                type="button"
                onClick={() => {
                  buzz(8);
                  k.onPress();
                }}
                className={cn(
                  "flex size-[64px] flex-col items-center justify-center rounded-full transition active:scale-[0.93]",
                  !k.tint && "bg-foreground/[0.06] text-foreground",
                  k.tint === "blue" && "bg-[#0A84FF]/15 text-[#0A6FE0] dark:text-[#64A9FF]",
                  k.tint === "violet" && "bg-[#AF52DE]/15 text-[#8E3AC4] dark:text-[#D08CF5]",
                )}
              >
                <span className="text-[23px] font-semibold leading-none tabular-nums">
                  {k.label}
                </span>
                {k.caption && (
                  <span className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wide opacity-70">
                    {k.caption}
                  </span>
                )}
              </button>
            ))}
          </div>

          {children}

          <div className={cn("grid gap-2", onWicket ? "grid-cols-2" : "grid-cols-1")}>
            {onWicket && (
              <button
                type="button"
                onClick={() => {
                  buzz(8);
                  onWicket();
                }}
                className="h-11 rounded-full bg-[#FF3B30]/[0.13] text-[15px] font-bold text-[#E0281E] transition active:scale-[0.97] dark:text-[#FF6A60]"
              >
                Wicket
              </button>
            )}
            <DialogPrimitive.Close className="h-11 rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-foreground/70 transition active:scale-[0.97]">
              Cancel
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** iOS-style three-way switch used inside a DialPopup. */
export function DialSwitch<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div
      className="mb-3 grid gap-0.5 rounded-[11px] bg-foreground/[0.07] p-0.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "h-9 rounded-[9px] text-[12.5px] font-semibold transition",
            value === o.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground active:opacity-60",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bye / Leg bye: how many runs. No penalty run on these. */
export function ByeRunsPopup({
  open,
  onOpenChange,
  kind,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: string;
  onSelect: (runs: number) => void;
}) {
  // Keep the last title while the card fades out.
  const [shown, setShown] = useState(kind);
  useEffect(() => {
    if (open && kind) setShown(kind);
  }, [open, kind]);
  const cap = (n: number) => (n === 1 ? "run" : n === 4 ? "Four" : "runs");
  return (
    <DialPopup
      open={open}
      onOpenChange={onOpenChange}
      title={shown === "Leg Bye" ? "Leg bye" : "Bye"}
      chip="not the batter's runs"
      accent="#1F9D55"
      keys={[1, 2, 3, 4, 5, 6].map((n) => ({
        label: String(n),
        caption: cap(n),
        tint: n === 4 ? ("blue" as const) : undefined,
        onPress: () => onSelect(n),
      }))}
    />
  );
}

/** Wide / No ball with extra runs (keyboard shortcut path; touch uses the bubble). */
export function ExtraDeliveryPopup({
  open,
  onOpenChange,
  kind,
  onSubmit,
  onWicket,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "No Ball" | "Wide";
  onSubmit: (mode: "bat" | "bye" | "leg_bye", runs: number) => void;
  onWicket: () => void;
}) {
  const [mode, setMode] = useState<"bat" | "bye" | "leg_bye">("bat");
  useEffect(() => {
    if (open) setMode("bat");
  }, [open]);
  const isNb = kind === "No Ball";
  const send = (runs: number) => onSubmit(isNb ? mode : "bat", runs);
  return (
    <DialPopup
      open={open}
      onOpenChange={onOpenChange}
      title={isNb ? "No ball" : "Wide"}
      chip="+1 added"
      accent={isNb ? "#FF7A1F" : "#E8950C"}
      main={{ label: isNb ? "Only the no-ball" : "Only the wide", onPress: () => send(0) }}
      keys={[
        { label: "+1", caption: "run", onPress: () => send(1) },
        { label: "+2", caption: "runs", onPress: () => send(2) },
        { label: "+3", caption: "runs", onPress: () => send(3) },
        { label: "4", caption: "Four", tint: "blue", onPress: () => send(4) },
        ...(isNb
          ? [{ label: "6", caption: "Six", tint: "violet" as const, onPress: () => send(6) }]
          : []),
      ]}
      onWicket={onWicket}
    >
      {isNb && (
        <DialSwitch
          value={mode}
          onChange={setMode}
          options={[
            { key: "bat", label: "Off the bat" },
            { key: "bye", label: "Byes" },
            { key: "leg_bye", label: "Leg byes" },
          ]}
        />
      )}
    </DialPopup>
  );
}
