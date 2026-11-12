import { cn } from "@/lib/utils";
import type { RosterTab } from "@/lib/attendance/roster";

type Kpis = {
  present: number;
  total: number;
  pct: number;
  notArrived: number;
  inAcademy: number;
  checkedOutToday: number;
  late: number;
};

/**
 * Day summary as quiet tiles (number first, its word under it), the same
 * look as the Metrol CRM attendance day view. Six tiles on a phone fit in
 * two rows of three, so the roster below stays in view.
 */
export function AttendanceSummary({
  kpis,
  onPick,
}: {
  kpis: Kpis;
  /** Tapping a tile opens its list below. */
  onPick?: (tab: RosterTab) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Day summary">
      <Tile
        n={`${kpis.present}/${kpis.total}`}
        label="Came today"
        onClick={() => onPick?.("present")}
      />
      <Tile n={`${kpis.pct}%`} label="Attendance" />
      <Tile
        n={kpis.notArrived}
        label="Not arrived"
        tone={kpis.notArrived > 0 ? "warn" : undefined}
        onClick={() => onPick?.("waiting")}
      />
      <Tile n={kpis.inAcademy} label="Inside now" tone="good" onClick={() => onPick?.("present")} />
      <Tile n={kpis.checkedOutToday} label="Left" tone="info" onClick={() => onPick?.("done")} />
      <Tile n={kpis.late} label="Late" tone={kpis.late > 0 ? "warn" : undefined} />
    </div>
  );
}

function Tile({
  n,
  label,
  tone,
  onClick,
}: {
  n: number | string;
  label: string;
  tone?: "good" | "info" | "warn";
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card px-3 py-2 text-left shadow-[var(--shadow-soft)]",
        onClick && "transition-colors hover:border-foreground/40 active:scale-[0.98]",
      )}
    >
      <span
        className={cn(
          "font-[family-name:var(--font-display)] text-[19px] font-extrabold leading-tight tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "info" && "text-sky-600 dark:text-sky-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {n}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </Wrapper>
  );
}
