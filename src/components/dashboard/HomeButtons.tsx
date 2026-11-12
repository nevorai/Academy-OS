/**
 * Owner Home: "What do you want to do?" — ten big buttons, each says what it does in plain words.
 * Written for academy owners who are not technical: one tap, one job. Numbers on a button
 * (new admissions, unpaid fees) tell them where something is waiting.
 */
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  Inbox,
  IndianRupee,
  LayoutGrid,
  Megaphone,
  QrCode,
  Swords,
  Users,
  UserPlus,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

type Btn = {
  to: string;
  title: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  /** A number waiting here (shown as a badge). */
  count?: number;
  show: boolean;
};

export function HomeButtons({
  canViewFees,
  canScoreMatch,
  isOwner,
  newRegs,
  pendingFees,
}: {
  canViewFees: boolean;
  canScoreMatch: boolean;
  isOwner: boolean;
  newRegs: number;
  pendingFees: number;
}) {
  const buttons: Btn[] = [
    {
      to: "/dashboard/attendance-overview",
      title: "Today's attendance",
      hint: "Who came, who is absent",
      icon: ClipboardCheck,
      show: true,
    },
    {
      to: "/dashboard/fees",
      title: "Fees",
      hint: "Who has not paid, collect money",
      icon: IndianRupee,
      count: pendingFees,
      show: canViewFees,
    },
    {
      to: "/dashboard/students",
      title: "Players",
      hint: "Everyone's details and batch",
      icon: Users,
      show: true,
    },
    {
      to: "/dashboard/new-admission",
      title: "New admission",
      hint: "Add a player, send login",
      icon: UserPlus,
      show: true,
    },
    {
      to: "/dashboard/registrations",
      title: "Enquiries",
      hint: "People who applied online",
      icon: Inbox,
      count: newRegs,
      show: true,
    },
    {
      to: "/match-center",
      title: "Matches",
      hint: "Score a match, see results",
      icon: Swords,
      show: canScoreMatch,
    },
    {
      to: "/dashboard/attendance-qr",
      title: "Check-in QR",
      hint: "Show the code players scan",
      icon: QrCode,
      show: true,
    },
    {
      to: "/dashboard/auto-messages",
      title: "WhatsApp messages",
      hint: "Automatic WhatsApp to players & parents",
      icon: Megaphone,
      show: true,
    },
    {
      to: "/dashboard/reports",
      title: "Reports",
      hint: "Money and attendance numbers",
      icon: BarChart3,
      show: true,
    },
    {
      to: "/dashboard/batches",
      title: "Batches & timings",
      hint: "Groups, days and times",
      icon: CalendarClock,
      show: true,
    },
    {
      to: "/dashboard/academy",
      title: "Settings",
      hint: "Academy details, coaches, plans",
      icon: LayoutGrid,
      show: isOwner,
    },
  ];
  const visible = buttons.filter((b) => b.show);

  return (
    <section aria-label="What do you want to do?">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        What do you want to do?
      </h2>
      <div className="grid grid-cols-4 gap-2 md:grid-cols-6 md:gap-2.5 xl:grid-cols-6">
        {visible.map((b) => (
          <Link
            key={b.to}
            // Typed router paths are strings here on purpose: the list is data, every path is a real route.
            to={b.to as never}
            preload="intent"
            className={cn(
              "group relative flex min-h-[84px] flex-col items-center justify-start gap-1.5 rounded-xl border border-border bg-card px-1 py-2.5 text-center md:min-h-[104px] md:items-stretch md:justify-between md:p-3.5 md:text-left",
              "shadow-[var(--shadow-soft)] transition-colors hover:border-primary/50 hover:bg-accent/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99]",
            )}
          >
            <span className="flex items-start justify-center md:justify-between">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <b.icon className="size-5" />
              </span>
              {b.count ? (
                <span className="absolute right-1 top-1 min-w-5 rounded-full bg-destructive px-1 py-0.5 text-center text-[10px] font-bold leading-none text-destructive-foreground md:static">
                  {b.count}
                </span>
              ) : null}
            </span>
            <span className="block md:mt-3">
              <span className="block text-[11.5px] font-semibold leading-tight md:text-[15px]">
                {b.title}
              </span>
              <span className="mt-0.5 hidden text-xs leading-snug text-muted-foreground md:block">
                {b.hint}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
