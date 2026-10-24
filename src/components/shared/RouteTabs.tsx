import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type RouteTab = { to: string; label: string; count?: number };

/**
 * The Metrol tab bar for pages that are separate routes but one job (Admissions = Registrations + Activation).
 * Several screens share one sidebar item this way instead of each taking a menu row. The lit tab is filled with
 * the academy's colour; the bar scrolls sideways on a phone, the page never does.
 */
export function RouteTabs({ tabs, label }: { tabs: RouteTab[]; label: string }) {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={label}
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const on = pathname === t.to || pathname.startsWith(t.to + "/");
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-[7px] border px-4 text-[13.5px] font-semibold",
              "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]",
              on
                ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-[color:var(--brand-ink)] shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:bg-accent hover:text-foreground",
            )}
          >
            {t.label}
            {t.count ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                  on ? "bg-white/25" : "bg-rose-600 text-white",
                )}
              >
                {t.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Registrations and Activation: one Admissions area, one menu row. */
export function AdmissionsTabs({ newCount }: { newCount?: number }) {
  return (
    <RouteTabs
      label="Admissions"
      tabs={[
        { to: "/dashboard/registrations", label: "Registrations", count: newCount },
        { to: "/dashboard/activation", label: "Activation" },
      ]}
    />
  );
}
