import { tileColor, tileStyles } from "@/lib/tile-colors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Swords,
  Activity,
  ShieldCheck,
  IndianRupee,
  Megaphone,
  UserCircle,
  LineChart,
  ClipboardCheck,
  Layers,
  UserPlus,
  Zap,
  CreditCard,
  BadgeCheck,
  BellRing,
  Receipt,
  Wallet,
  BarChart3,
  Lightbulb,
  QrCode,
  Palette,
  Globe,
  Inbox,
  CalendarDays,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { useCurrentRole } from "@/hooks/use-current-role";
import { getFeatures } from "@/lib/tenant";

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
        to: "/match-center/dashboard",
        label: "Match Center",
        hint: "Matches, teams, scoring",
        icon: Swords,
        keywords: ["cricket", "matches", "teams", "tournament", "score"],
      },
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
  label: "Profile",
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
// Small shortcuts for things an owner opens now and then. Fees pages open inside the Fees screen.
const SHORTCUTS: Item[] = [
  { to: "/dashboard/registrations", label: "Enquiries", hint: "New applications", icon: Inbox },
  { to: "/dashboard/reports", label: "Reports", hint: "Reports and exports", icon: BarChart3 },
  {
    to: "/dashboard/insights",
    label: "Insights",
    hint: "How the academy is doing",
    icon: Lightbulb,
  },
  { to: "/dashboard/attendance-qr", label: "QR attendance", hint: "Scan to mark", icon: QrCode },
  {
    to: "/dashboard/attendance-calendar",
    label: "Calendar",
    hint: "Attendance by day",
    icon: CalendarDays,
  },
  { to: "/dashboard/branding", label: "Branding", hint: "Logo and colours", icon: Palette },
  { to: "/dashboard/site", label: "Website", hint: "Your public site", icon: Globe },
];
const FEE_SHORTCUTS: Item[] = [
  {
    to: "/dashboard/payment-verification",
    label: "Approvals",
    hint: "Verify payments",
    icon: BadgeCheck,
  },
  { to: "/dashboard/reminders", label: "Reminders", hint: "Fee reminders", icon: BellRing },
  { to: "/dashboard/fee-plans", label: "Sessions & fees", hint: "Plans and prices", icon: Receipt },
  { to: "/dashboard/payment-settings", label: "Payment setup", hint: "UPI and bank", icon: Wallet },
];
const OWNER_GROUPS: Group[] = [
  ...WORKSPACE_GROUPS,
  { title: "Shortcuts", items: [...FEE_SHORTCUTS, ...SHORTCUTS] },
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
const ADMIN_GROUPS: Group[] = [
  ...WORKSPACE_GROUPS,
  { title: "Shortcuts", items: SHORTCUTS },
  { title: "Account", items: [PROFILE_ITEM] },
];

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

  // One flat set of buttons, four to a row. No section titles, no search: nothing to scroll or read.
  const items = useMemo<Item[]>(
    () =>
      groupsFor(role)
        .flatMap((g) => g.items)
        .filter((i) => !i.requiresFeature || features[i.requiresFeature] !== false),
    [role, features],
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 pb-4">
      <h1 className="text-lg font-semibold tracking-tight">Manage</h1>
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {items.map((item, i) => (
          <HubTile key={item.to + item.label} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}

function HubTile({ item, index }: { item: Item; index: number }) {
  const Icon = item.icon;
  const st = tileStyles(tileColor(index));
  return (
    <Link
      to={item.to}
      aria-label={item.label}
      style={st.card}
      className="group flex min-h-[88px] flex-col items-center justify-start gap-1.5 rounded-xl border px-1.5 py-3 text-center shadow-[var(--shadow-soft)] outline-none transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] active:scale-[0.97]"
    >
      <span style={st.chip} className="grid size-10 shrink-0 place-items-center rounded-xl">
        <Icon className="size-5" />
      </span>
      <span className="line-clamp-2 break-words text-[11.5px] font-semibold leading-tight">
        {item.label}
      </span>
    </Link>
  );
}
