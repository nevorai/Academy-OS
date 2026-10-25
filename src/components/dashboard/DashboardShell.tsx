import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { ProductTour, useAutoOpenTour } from "@/components/dashboard/ProductTour";
import { HelpCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Inbox,
  Users,
  LogOut,
  ExternalLink,
  IndianRupee,
  BarChart3,
  ClipboardCheck,
  Swords,
  Megaphone,
  UserCircle,
  Sparkles,
  LayoutGrid,
  Moon,
  Sun,
} from "lucide-react";
import { getFeatures, tenantSiteUrl } from "@/lib/tenant";
import { useT } from "@/lib/i18n";
import { StoragedImage } from "@/components/site/StoragedImage";
import { Tip } from "@/components/ui/tip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setStoredThemeMode } from "@/components/dashboard/ThemeToggle";
import { DashboardSidebar, type SideGroup } from "@/components/dashboard/DashboardSidebar";
import { GlobalBottomNav } from "@/components/shared/GlobalBottomNav";
import { useNewRegistrationsCount } from "@/hooks/use-new-registrations";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { TrialBanner } from "@/components/dashboard/TrialBanner";
import { NevorAIProvider } from "@/components/nevorai/NevorAIProvider";
import { NevorAIButton } from "@/components/nevorai/NevorAIButton";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  requiresFeature?: "fee_tracking";
  ownerOnly?: boolean;
  adminOnly?: boolean;
  coachOnly?: boolean;
  tourId?: string;
};

// Twelve items, daily things first (Profile is pinned at the foot). Everything else (batches, activation, automation, team, billing,
// AI health) is one tap away in Manage; Match Center carries its own tabs (Live, Matches, Players,
// Insights); Registrations and Activation share one Admissions page tab strip.
type NavGroup = { title: string | null; bottom?: boolean; items: NavItem[] };
const navGroups: NavGroup[] = [
  {
    title: null,
    items: [
      { to: "/dashboard", label: "Home", icon: LayoutDashboard, tourId: "home" },
      { to: "/dashboard/nevorai", label: "Kaizen", icon: Sparkles, ownerOnly: true, tourId: "nevorai" },
      { to: "/dashboard/coach", label: "My Coaching", icon: ClipboardCheck, coachOnly: true },
    ],
  },
  {
    title: "Daily",
    items: [
      { to: "/dashboard/attendance", label: "Attendance", icon: ClipboardCheck },
      {
        to: "/dashboard/fees",
        label: "Fees",
        icon: IndianRupee,
        requiresFeature: "fee_tracking",
        ownerOnly: true,
        tourId: "fees",
      },
    ],
  },
  {
    title: "People",
    items: [
      { to: "/dashboard/students", label: "Players", icon: Users },
      { to: "/dashboard/registrations", label: "Admissions", icon: Inbox, tourId: "registrations" },
    ],
  },
  {
    title: "Cricket",
    items: [{ to: "/match-center", label: "Match Center", icon: Swords, tourId: "match-center" }],
  },
  {
    title: "Grow",
    items: [
      { to: "/dashboard/communications", label: "Communications", icon: Megaphone },
      { to: "/dashboard/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    title: null,
    items: [{ to: "/dashboard/academy", label: "Manage", icon: LayoutGrid, ownerOnly: true }],
  },
  // Pinned at the foot of the sidebar: account, notifications, settings, scorers.
  {
    title: null,
    bottom: true,
    items: [{ to: "/dashboard/profile", label: "Profile", icon: UserCircle, tourId: "profile" }],
  },
];

/** Pages that belong to a sidebar item without being its own route: the item stays lit on all of them. */
const LIT_ALSO: Record<string, string[]> = {
  "/dashboard/registrations": ["/dashboard/activation"],
  "/dashboard/students": ["/dashboard/batches"],
  "/dashboard/academy": [
    "/dashboard/staff",
    "/dashboard/batches",
    "/dashboard/automation",
    "/dashboard/billing",
    "/dashboard/nevorai-health",
    "/dashboard/subscription",
  ],
  "/dashboard/profile": ["/dashboard/settings", "/dashboard/notifications", "/dashboard/payment-settings"],
  "/match-center": ["/scorer"],
};

export function DashboardShell({ children }: { children: ReactNode }) {
  const { tenant, profile, session, signOut } = useDashboard();
  const { t } = useT();
  // Phase 3 — role via has_role / current_role RPC (usePermissions).
  const { isOwner, isCoach: isCoachRole, isHeadCoach, isAssistantCoach } = usePermissions();
  const isAnyCoach = isCoachRole || isHeadCoach || isAssistantCoach;

  // Owner product tour — auto-open on first dashboard visit for owners/admins.
  const autoOpen = useAutoOpenTour();
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (autoOpen) setTourOpen(true);
  }, [autoOpen]);
  const canSeeTour = (profile.role ?? "").toLowerCase() === "owner" ||
    (profile.role ?? "").toLowerCase() === "admin";


  // Single source of truth for the "new registration" badge — status='new'.
  const newRegCount = useNewRegistrationsCount(tenant.id);

  // Live match indicator for the Match Center tab.
  const liveMatchCount = useQuery({
    queryKey: ["mc-live-count", tenant.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("matches" as never)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .eq("status", "live");
      return count ?? 0;
    },
    refetchInterval: 60_000,
    staleTime: 15_000,
  });

  const features = getFeatures(tenant);
  const withBadges = (items: NavItem[]) =>
    items
      .filter((n) => !n.requiresFeature || features[n.requiresFeature] !== false)
      .filter((n) => (n.ownerOnly ? isOwner : true))
      .filter((n) => (n.adminOnly ? !isOwner : true))
      .filter((n) => (n.coachOnly ? isAnyCoach : true))
      .map((n) => {
        const label = t(n.label);
        let badge: number | undefined;
        let live = false;
        if (n.to === "/dashboard/registrations" && newRegCount) badge = newRegCount;
        if (n.to === "/match-center" && (liveMatchCount.data ?? 0) > 0) live = true;
        return { ...n, label, badge, live, also: LIT_ALSO[n.to] };
      });

  const groups: SideGroup[] = navGroups
    .map((g) => ({ title: g.title ? t(g.title) : null, bottom: g.bottom, items: withBadges(g.items) }))
    .filter((g) => g.items.length > 0);

  return (
    <NevorAIProvider>
    <div className="owner-app min-h-dvh bg-background text-foreground">
      {/* Top bar */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-40 bg-background"
        style={{ height: "var(--app-safe-top)" }}
      />
      <div
        aria-hidden="true"
        className="bg-background"
        style={{ height: "var(--app-safe-top)" }}
      />
      <header
        className="sticky z-40 border-b border-border bg-card"
        style={{ top: "var(--app-safe-top)" }}
      >
        <TooltipProvider delayDuration={0}>
          <div className="flex h-14 items-center gap-3 px-4 md:px-5">
            <TenantMark tenant={tenant} />
            <div className="ml-auto flex items-center gap-1.5">
              <a
                href={tenantSiteUrl(tenant)}
                target="_blank"
                rel="noreferrer"
                className="mr-1 hidden items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                {t("View site")} <ExternalLink className="size-3" />
              </a>

              <ThemeButton />
              <NotificationBell />
              <NevorAIButton />

              {canSeeTour ? (
                <Tip label={t("Take the tour")} side="bottom">
                  <button
                    type="button"
                    onClick={() => setTourOpen(true)}
                    aria-label={t("Take the tour")}
                    className={cn(ICON_BTN, "hidden md:grid")}
                  >
                    <HelpCircle className="size-4" />
                  </button>
                </Tip>
              ) : null}

              <UserChip
                name={userName(session.user)}
                role={profile.role}
                onSignOut={signOut}
                signOutLabel={t("Sign out")}
              />
            </div>
          </div>
        </TooltipProvider>
      </header>


      <div className="flex">
        {/* Desktop sidebar: resizable, folds to icons */}
        <DashboardSidebar groups={groups} />

        <main className="mx-auto w-full min-w-0 max-w-[1320px] flex-1 px-4 pt-4 pb-32 md:px-[3%] md:pt-8 md:pb-8">
          <div className="mb-4">
            <TrialBanner />
          </div>
          {children ?? <Outlet />}
        </main>
      </div>

      {/* Unified mobile bottom nav — shared with Match Center for a seamless experience. */}
      <GlobalBottomNav />
      {canSeeTour ? (
        <ProductTour open={tourOpen} onClose={() => setTourOpen(false)} />
      ) : null}
    </div>
    </NevorAIProvider>
  );
}

function TenantMark({ tenant }: { tenant: { name: string; logo_url: string | null } }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className="grid size-8 shrink-0 place-items-center rounded-md text-xs font-bold text-white"
        style={{ backgroundColor: "var(--tenant-brand, var(--brand, #2A7A4B))" }}
      >
        {tenant.logo_url ? (
          <StoragedImage
            path={tenant.logo_url}
            alt={tenant.name}
            className="size-8 rounded-md object-cover"
            fallback={<span>{tenant.name.slice(0, 2).toUpperCase()}</span>}
          />
        ) : (
          tenant.name.slice(0, 2).toUpperCase()
        )}
      </div>
      <div className="truncate text-[15px] font-semibold tracking-tight">{tenant.name}</div>
    </div>
  );
}

const ICON_BTN =
  "grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]";

function userName(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata ?? {};
  const full = (meta.full_name ?? meta.name) as string | undefined;
  return full?.trim() || user.email?.split("@")[0] || "You";
}

/** Light / dark in one tap; the full light-dark-system choice stays in Profile. */
function ThemeButton() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const label = dark ? "Light mode" : "Dark mode";
  return (
    <Tip label={label} side="bottom">
      <button
        type="button"
        aria-label={label}
        className={ICON_BTN}
        onClick={() => {
          setStoredThemeMode(dark ? "light" : "dark");
          setDark(!dark);
        }}
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </Tip>
  );
}

/** Who you are and the way out live up here (like Metrol), so the sidebar gets the whole height. */
function UserChip({
  name,
  role,
  onSignOut,
  signOutLabel,
}: {
  name: string;
  role: string;
  onSignOut: () => void;
  signOutLabel: string;
}) {
  return (
    <div className="ml-1.5 flex items-center gap-2 border-l border-border pl-3">
      <Link
        to="/dashboard/profile"
        aria-label="Your profile"
        className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
      >
        <span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold uppercase text-foreground">
          {name.slice(0, 1)}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block max-w-[150px] truncate text-[13px] font-medium">{name}</span>
          <span className="block text-[11px] capitalize text-muted-foreground">{role}</span>
        </span>
      </Link>
      <Tip label={signOutLabel} side="bottom">
        <button
          type="button"
          onClick={onSignOut}
          aria-label={signOutLabel}
          className={cn(ICON_BTN, "hidden md:grid")}
        >
          <LogOut className="size-4" />
        </button>
      </Tip>
    </div>
  );
}
