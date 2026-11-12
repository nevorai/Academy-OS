import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Swords,
  Activity,
  ShieldCheck,
  Search,
  IndianRupee,
  Megaphone,
  UserCircle,
  LineChart,
  ClipboardCheck,
  Layers,
  UserPlus,
  Zap,
  CreditCard,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { useCurrentRole } from "@/hooks/use-current-role";
import { getFeatures } from "@/lib/tenant";
import { SearchBar } from "@/components/ds/SearchBar";

export const Route = createFileRoute("/dashboard/academy")({
  head: () => ({
    meta: [{ title: "Manage · Nevorai Academy" }, { name: "robots", content: "noindex" }],
  }),
  component: ManageHub,
});

type Item = {
  to: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  requiresFeature?: "fee_tracking";
};

type Group = { title: string; items: Item[] };

/* ------------------------------------------------------------------ */
/* Manage = Daily operational workspaces only.                        */
/* Each entry opens a full workspace with its own internal navigation.*/
/* Settings/config lives in Profile.                                  */
/* ------------------------------------------------------------------ */

// Only what the sidebar and Home do NOT already show. One place per thing: Players, Fees, Reports,
// Attendance, Admissions, Match Center and Broadcasts live in the sidebar; Kaizen is not shown to owners.
const WORKSPACE_GROUPS: Group[] = [
  {
    title: "Academy",
    items: [
      {
        to: "/dashboard/new-admission",
        label: "New admission",
        hint: "Add a player and send the login",
        icon: UserPlus,
        keywords: ["admit", "add player", "join", "register"],
      },
      {
        to: "/dashboard/batches",
        label: "Batches & timings",
        hint: "Training groups and times",
        icon: Layers,
        keywords: ["groups", "schedule", "timings", "sessions"],
      },
      {
        to: "/dashboard/staff",
        label: "Coaches & team",
        hint: "Members and roles",
        icon: ShieldCheck,
        keywords: ["staff", "coach", "invite", "access"],
      },
    ],
  },
  {
    title: "Messages",
    items: [
      {
        to: "/dashboard/auto-messages",
        label: "WhatsApp messages",
        hint: "Automatic messages to parents",
        icon: Megaphone,
        keywords: ["whatsapp", "parents", "reminder", "receipt"],
      },
      {
        to: "/dashboard/automation",
        label: "Automation",
        hint: "Rules and scheduled workflows",
        icon: Zap,
        keywords: ["rules", "triggers", "workflows", "auto", "scheduled"],
      },
    ],
  },
  {
    title: "Cricket",
    items: [
      {
        to: "/match-center/live",
        label: "Live scoring",
        hint: "Score a match ball by ball",
        icon: Activity,
        keywords: ["ball", "score", "match"],
      },
    ],
  },
];

// The sidebar keeps only the daily workspaces, so the rest of an owner's tools are here: one place, searchable.
const PROFILE_ITEM: Item = {
  to: "/dashboard/profile",
  label: "Profile & settings",
  hint: "Your details, theme, notifications, payment setup and branding",
  icon: UserCircle,
  keywords: [
    "account",
    "password",
    "theme",
    "dark",
    "branding",
    "payments",
    "upi",
    "notifications",
    "tour",
  ],
};
const OWNER_GROUPS: Group[] = [
  ...WORKSPACE_GROUPS,
  {
    title: "Account",
    items: [
      PROFILE_ITEM,
      {
        to: "/dashboard/billing",
        label: "Billing",
        hint: "Your Nevorai Academy plan, invoices and usage",
        icon: CreditCard,
        keywords: ["plan", "subscription", "invoice", "gst", "pay", "renew"],
      },
    ],
  },
];

// Admin — same workspaces as Owner, without the owner-only Account tools.
const ADMIN_GROUPS: Group[] = [...WORKSPACE_GROUPS, { title: "Account", items: [PROFILE_ITEM] }];

// Player / Parent — personal workspaces only.
const PLAYER_GROUPS: Group[] = [
  {
    title: "Profile",
    items: [
      { to: "/student/profile", label: "My Profile", hint: "Personal details", icon: UserCircle },
    ],
  },
  {
    title: "Training",
    items: [
      { to: "/student", label: "My Attendance", hint: "Sessions & streaks", icon: ClipboardCheck },
      {
        to: "/student/progress",
        label: "My Performance",
        hint: "Progress & milestones",
        icon: LineChart,
      },
    ],
  },
  {
    title: "Matches",
    items: [
      { to: "/student/matches", label: "My Matches", hint: "Fixtures & scorecards", icon: Swords },
    ],
  },
  {
    title: "Fees",
    items: [{ to: "/fees", label: "My Fees", hint: "Payments & receipts", icon: IndianRupee }],
  },
];

function groupsFor(role: "owner" | "admin" | "student"): Group[] {
  if (role === "owner") return OWNER_GROUPS;
  if (role === "admin") return ADMIN_GROUPS;
  return PLAYER_GROUPS;
}

function ManageHub() {
  const { tenant } = useDashboard();
  const role = useCurrentRole();
  const features = getFeatures(tenant);
  const [q, setQ] = useState("");

  const groups = useMemo<Group[]>(() => {
    const raw = groupsFor(role);
    const gated = raw
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.requiresFeature || features[i.requiresFeature] !== false),
      }))
      .filter((g) => g.items.length > 0);

    if (!q.trim()) return gated;
    const needle = q.toLowerCase();
    return gated
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.label.toLowerCase().includes(needle) ||
            i.hint.toLowerCase().includes(needle) ||
            g.title.toLowerCase().includes(needle) ||
            (i.keywords ?? []).some((k) => k.toLowerCase().includes(needle)),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [role, q, features]);

  const roleLabel = role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Player";

  return (
    <div className="-mt-4 md:-mt-8 space-y-4 pb-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-2 pb-1">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight leading-tight truncate">Manage</h1>
          <p className="text-[11px] text-muted-foreground leading-tight truncate">
            {tenant.name} · {roleLabel} · Daily operations
          </p>
        </div>
      </header>

      <SearchBar value={q} onChange={setQ} placeholder="Search…" />

      {groups.length === 0 ? (
        <div className="grid place-items-center py-16 text-center text-muted-foreground">
          <Search className="size-6 mb-2" />
          <p className="text-sm">No results for "{q}"</p>
        </div>
      ) : (
        groups.map((group) => (
          <Section key={group.title} title={group.title}>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3 lg:grid-cols-8">
              {group.items.map((item) => (
                <HubTile key={group.title + item.to + item.label} item={item} />
              ))}
            </div>
          </Section>
        ))
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
        {title}
      </h2>
      {children}
    </section>
  );
}

function HubTile({ item }: { item: Item }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-label={item.label}
      className="group flex min-h-[88px] flex-col items-center justify-start gap-1.5 rounded-xl border border-border bg-card px-1.5 py-3 text-center outline-none transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] active:scale-[0.97]"
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl"
        style={{
          backgroundColor: "color-mix(in oklab, var(--brand) 12%, transparent)",
          color: "var(--brand)",
        }}
      >
        <Icon className="size-5" />
      </span>
      <span className="line-clamp-2 break-words text-[11.5px] font-semibold leading-tight">
        {item.label}
      </span>
    </Link>
  );
}
