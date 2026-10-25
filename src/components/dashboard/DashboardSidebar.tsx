import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tip } from "@/components/ui/tip";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { loadPanePref, savePanePref, SIDE_KEY, SIDE_LIMITS } from "@/lib/pane-pref";

export type SideItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tourId?: string;
  badge?: number;
  live?: boolean;
  /** Other pages that belong to this item: it stays lit on them. */
  also?: string[];
};
export type SideGroup = { title: string | null; items: SideItem[]; /** Pinned at the foot, above the fold button. */ bottom?: boolean };

const L = SIDE_LIMITS;

/**
 * Desktop sidebar, drawn the way the Metrol CRM rail is: a bordered tile per item, the lit one filled with
 * the academy's colour and a dark bar on its left edge, group names in small capitals, and the fold button at
 * the foot. Who you are and the way out live in the top bar, so the list gets the whole height.
 *
 * Nevorai sidebar standard: drag the edge to resize, fold to icons, the folded strip keeps its edge so a click
 * or drag opens it, every icon has an instant name tooltip, and the size is remembered. Phones use the bottom nav.
 */
export function DashboardSidebar({ groups: allGroups }: { groups: SideGroup[] }) {
  const location = useLocation();
  const groups = allGroups.filter((g) => !g.bottom);
  const footItems = allGroups.filter((g) => g.bottom).flatMap((g) => g.items);
  const [pref, setPref] = useState(() => loadPanePref(SIDE_KEY, L.def, L.min, L.max));
  // While dragging: the look the panel has right now (null = follow the saved state).
  const [preview, setPreview] = useState<boolean | null>(null);
  const compact = preview ?? pref.collapsed;

  const commit = (next: { width: number; folded: boolean }) => {
    const p = { width: next.width, collapsed: next.folded };
    setPref(p);
    setPreview(null);
    savePanePref(SIDE_KEY, p);
  };
  const toggleFold = () => commit({ width: pref.width, folded: !pref.collapsed });

  const on = (to: string) =>
    to === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname === to || location.pathname.startsWith(to + "/");
  const isActive = (n: SideItem) => on(n.to) || (n.also ?? []).some(on);

  const renderItem = (n: SideItem) => {
    const active = isActive(n);
    const Icon = n.icon;
    const link = (
      <Link
        key={n.to}
        to={n.to}
        data-tour={n.tourId}
        aria-label={n.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-9 items-center rounded-[9px] border text-[13px] font-medium",
          "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]",
          compact ? "mx-auto w-9 justify-center" : "w-full gap-2.5 px-2.5",
          active
            ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-[color:var(--brand-ink)]"
            : "border-border bg-muted/40 text-muted-foreground hover:border-foreground/30 hover:bg-accent hover:text-foreground",
        )}
      >
        {active && (
          <span className="absolute -left-3 top-2 bottom-2 w-[2.5px] rounded-r-sm bg-foreground" aria-hidden />
        )}
        <span className="relative grid w-[18px] shrink-0 place-items-center">
          <Icon className="size-[17px]" />
          {n.live ? (
            <span
              aria-hidden
              className="absolute -right-1 -top-0.5 size-1.5 animate-pulse rounded-full bg-rose-600 ring-2 ring-card"
            />
          ) : null}
          {compact && n.badge ? (
            <span className="absolute -right-3 -top-3 grid min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-4 text-white">
              {n.badge > 99 ? "99+" : n.badge}
            </span>
          ) : null}
        </span>
        {!compact && (
          <>
            <span className="flex-1 truncate">{n.label}</span>
            {n.live ? (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white">
                LIVE
              </span>
            ) : null}
            {n.badge ? (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {n.badge}
              </span>
            ) : null}
          </>
        )}
      </Link>
    );
    return compact ? (
      <Tip key={n.to} label={n.label}>
        {link}
      </Tip>
    ) : (
      link
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        style={{ width: pref.collapsed ? L.folded : pref.width }}
        className="sticky top-[calc(var(--app-safe-top)+3.5rem)] hidden h-[calc(100dvh-var(--app-safe-top)-3.5rem)] shrink-0 border-r border-border bg-card transition-[width] duration-200 ease-out md:block"
      >
        <div className="flex h-full flex-col overflow-hidden whitespace-nowrap p-3">
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {groups.map((g, i) => (
              <div key={g.title ?? `g${i}`} className="flex flex-col gap-1">
                {i > 0 ? (
                  g.title && !compact ? (
                    <div className="px-1.5 pb-0.5 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                      {g.title}
                    </div>
                  ) : (
                    <div className={cn("my-1 h-px bg-border", compact && "mx-auto w-7")} />
                  )
                ) : null}
                {g.items.map(renderItem)}
              </div>
            ))}
          </nav>

          {footItems.length > 0 ? (
            <div className="flex flex-col gap-1 border-t border-border pt-2">{footItems.map(renderItem)}</div>
          ) : null}

          <div className="flex justify-center pt-2">
            <Tip label={compact ? "Show names" : "Icons only"} side={compact ? "right" : "top"}>
              <button
                type="button"
                onClick={toggleFold}
                aria-label={compact ? "Show names" : "Icons only"}
                className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
              >
                {compact ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
              </button>
            </Tip>
          </div>
        </div>

        {/* Always the last child, in both states: a remount would drop a drag in progress. */}
        <ResizeHandle
          width={pref.width}
          folded={pref.collapsed}
          foldedWidth={L.folded}
          min={L.min}
          max={L.max}
          showAt={L.showAt}
          label="Resize sidebar"
          onPreview={setPreview}
          onCommit={commit}
          onReset={() => commit({ width: L.def, folded: false })}
        />
      </aside>
    </TooltipProvider>
  );
}
