import { cn } from "@/lib/utils";

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
export function AttendanceSummary({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Day summary">
      <Tile n={`${kpis.present}/${kpis.total}`} label="Present" />
      <Tile n={`${kpis.pct}%`} label="Attendance" />
      <Tile n={kpis.notArrived} label="Waiting" tone={kpis.notArrived > 0 ? "warn" : undefined} />
      <Tile n={kpis.inAcademy} label="Inside" tone="good" />
      <Tile n={kpis.checkedOutToday} label="Out" tone="info" />
      <Tile n={kpis.late} label="Late" tone={kpis.late > 0 ? "warn" : undefined} />
    </div>
  );
}

function Tile({
  n,
  label,
  tone,
}: {
  n: number | string;
  label: string;
  tone?: "good" | "info" | "warn";
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card px-3 py-2 shadow-[var(--shadow-soft)]">
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
    </div>
  );
}
