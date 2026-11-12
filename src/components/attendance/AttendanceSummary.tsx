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
 * The day in ONE slim line instead of a block of tiles, so the list gets the screen.
 * The counts that matter (inside, left, not arrived) are on the list tabs right below.
 */
export function AttendanceSummary({
  kpis,
  onPick,
}: {
  kpis: Kpis;
  /** Tapping "came today" opens the list of players who came. */
  onPick?: (tab: RosterTab) => void;
}) {
  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 text-[12.5px] text-muted-foreground"
      aria-label="Day summary"
    >
      <button
        type="button"
        onClick={() => onPick?.("present")}
        className="font-semibold text-foreground active:opacity-70"
      >
        {kpis.present}/{kpis.total} came today
      </button>
      <span className="tabular-nums">{kpis.pct}% attendance</span>
      <span className={cn("tabular-nums", kpis.late > 0 && "font-semibold text-amber-600")}>
        {kpis.late} late
      </span>
    </div>
  );
}
