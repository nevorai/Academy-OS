import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { addDays, format, isToday, isYesterday, startOfDay } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  IdCard,
  MoreVertical,
  QrCode,
  Zap,
} from "lucide-react";
import { LiveBadge } from "@/components/ds";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScanStudentCardDialog } from "@/components/attendance/ScanStudentCardDialog";
import { cn } from "@/lib/utils";

const chip =
  "inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border px-2.5 py-2 text-[11px] font-medium transition-colors active:scale-95";
const chipIdle = "border-border bg-card text-muted-foreground hover:text-foreground";
const chipOn = "border-primary/40 bg-primary/10 text-primary";
const stepBtn =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-40";

/** Title, day stepper (‹ date ›) and the tool chips for the Attendance screen. */
export function AttendanceToolbar({
  selectedDate,
  onDateChange,
  selectedISO,
  canMark,
  quickMode,
  onToggleQuick,
  selectMode,
  onToggleSelect,
  onRecorded,
}: {
  selectedDate: Date;
  onDateChange: (d: Date) => void;
  selectedISO: string;
  canMark: boolean;
  quickMode: boolean;
  onToggleQuick: () => void;
  selectMode: boolean;
  onToggleSelect: () => void;
  onRecorded: () => void;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const [scanCards, setScanCards] = useState(false);
  const todayView = isToday(selectedDate);
  const today = startOfDay(new Date());

  const pick = (d: Date) => {
    onDateChange(startOfDay(d));
    setDateOpen(false);
  };

  return (
    <div className="pt-2 pb-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-lg font-bold leading-tight tracking-tight">
          Attendance
        </h1>
        {todayView ? <LiveBadge state="live" /> : null}
      </div>

      <div className="mt-2 -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          aria-label="Previous day"
          className={stepBtn}
          onClick={() => onDateChange(startOfDay(addDays(selectedDate, -1)))}
        >
          <ChevronLeft className="size-4" />
        </button>

        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Change date"
              className={cn(chip, chipIdle, "text-xs text-foreground")}
            >
              {todayView
                ? "Today"
                : isYesterday(selectedDate)
                  ? "Yesterday"
                  : format(selectedDate, "d MMM yyyy")}
              <ChevronDown className="size-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <div className="flex flex-col gap-1">
              <DayChoice label="Today" active={todayView} onClick={() => pick(today)} />
              <DayChoice
                label="Yesterday"
                active={isYesterday(selectedDate)}
                onClick={() => pick(addDays(today, -1))}
              />
              <div className="my-1 h-px bg-border" />
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && pick(d)}
                // Future days cannot be selected.
                disabled={(d) => startOfDay(d).getTime() > today.getTime()}
                initialFocus
                className="pointer-events-auto p-0"
              />
            </div>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          aria-label="Next day"
          className={stepBtn}
          disabled={todayView}
          onClick={() => onDateChange(startOfDay(addDays(selectedDate, 1)))}
        >
          <ChevronRight className="size-4" />
        </button>

        {todayView ? (
          <>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
            <button
              type="button"
              onClick={onToggleQuick}
              aria-pressed={quickMode}
              aria-label="Toggle quick attendance mode"
              className={cn(chip, quickMode ? chipOn : chipIdle)}
            >
              <Zap className="size-3" /> Quick
            </button>
            {canMark ? (
              <button
                type="button"
                onClick={onToggleSelect}
                aria-pressed={selectMode}
                aria-label="Toggle bulk selection"
                className={cn(chip, selectMode ? chipOn : chipIdle)}
              >
                <CheckSquare className="size-3" /> Select
              </button>
            ) : null}
            {canMark ? (
              <button
                type="button"
                onClick={() => setScanCards(true)}
                aria-label="Scan player ID cards"
                className={cn(chip, chipIdle)}
              >
                <IdCard className="size-3" /> Cards
              </button>
            ) : null}
            <Link
              to="/dashboard/attendance-calendar"
              aria-label="Attendance calendar"
              className={cn(chip, chipIdle)}
            >
              <CalendarDays className="size-3" /> Calendar
            </Link>
            {canMark ? (
              <Link
                to="/dashboard/attendance-qr"
                aria-label="QR check-in setup"
                className={cn(chip, chipIdle)}
              >
                <QrCode className="size-3" /> QR
              </Link>
            ) : null}
            <ScanStudentCardDialog
              open={scanCards}
              onOpenChange={setScanCards}
              onRecorded={onRecorded}
            />
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="History options" className={stepBtn}>
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link
                  to="/dashboard/reports"
                  search={{ tab: "attendance", date: selectedISO } as never}
                >
                  Open full report
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.print()}>Export PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function DayChoice({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted",
        active && "font-semibold",
      )}
    >
      <span>{label}</span>
      {active ? <CheckCircle2 className="size-4 text-primary" /> : null}
    </button>
  );
}
