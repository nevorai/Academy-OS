import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
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
};
export type SideGroup = { title: string | null; items: SideItem[] };

const L = SIDE_LIMITS;

/**
 * Desktop sidebar (Nevorai sidebar standard): drag the edge to resize, fold to icons,
 * the folded strip keeps its edge so a click or drag opens it, every icon has an instant
 * name tooltip, and the size is remembered. Phones use the bottom nav instead.
 */
export function DashboardSidebar({
  groups,
  tenantName,
  role,
  onSignOut,
}: {
  groups: SideGroup[];
  tenantName: string;
  role: string;
  onSignOut: () => void;
}) {
  const { t } = useT();
  const location = useLocation();
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

  const isActive = (to: string) =>
    to === "/dashboard"
      ? location.pathname === "/dashboard"
      : location.pathname === to || location.pathname.startsWith(to + "/");

  const renderItem = (n: SideItem) => {
    const active = isActive(n.to);
    const Icon = n.icon;
    const link = (
      <Link
        key={n.to}
        to={n.to}
        data-tour={n.tourId}
        aria-label={n.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center rounded-lg py-2 text-sm transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]",
          compact ? "justify-center px-0" : "gap-3 px-3",
          active
            ? "bg-accent/40 font-semibold text-foreground"
            : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
        )}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full"
            style={{ backgroundColor: "var(--brand)" }}
          />
        )}
        <span className="relative inline-flex">
          <Icon className="size-4" />
          {n.live ? (
            <span
              aria-hidden
              className="absolute -right-1 -top-0.5 size-1.5 animate-pulse rounded-full bg-rose-600 ring-2 ring-background"
            />
          ) : null}
          {compact && n.badge ? (
            <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-4 text-white">
              {n.badge > 99 ? "99+" : n.badge}
            </span>
          ) : null}
        </span>
        {!compact && (
          <>
            <span className="flex-1">{n.label}</span>
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
        <div className="flex h-full flex-col overflow-hidden whitespace-nowrap">
          <div
            className={cn(
              "flex items-center border-b border-border",
              compact ? "justify-center p-3" : "justify-between gap-2 p-4",
            )}
          >
            {!compact && (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{tenantName}</div>
                <div className="text-xs capitalize text-muted-foreground">{role}</div>
              </div>
            )}
            <Tip label={compact ? "Open sidebar" : "Fold sidebar"} side={compact ? "right" : "bottom"}>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label={compact ? "Open sidebar" : "Fold sidebar"}
                onClick={toggleFold}
              >
                {compact ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
              </Button>
            </Tip>
          </div>

          <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2">
            {groups.map((g, i) => (
              <div key={g.title ?? `g${i}`} className="space-y-1">
                {g.title ? (
                  compact ? (
                    <div className="mx-3 my-2 h-px bg-border" />
                  ) : (
                    <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {g.title}
                    </div>
                  )
                ) : null}
                {g.items.map(renderItem)}
              </div>
            ))}
          </nav>

          <div className="border-t border-border p-2">
            {compact ? (
              <Tip label={t("Sign out")}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-full"
                  aria-label={t("Sign out")}
                  onClick={onSignOut}
                >
                  <LogOut className="size-4" />
                </Button>
              </Tip>
            ) : (
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onSignOut}>
                <LogOut className="mr-2 size-4" /> {t("Sign out")}
              </Button>
            )}
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
