import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  readStoredThemeMode,
  resolveTheme,
  setStoredThemeMode,
} from "@/components/dashboard/ThemeToggle";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { getPageHeroImages } from "@/lib/page-hero-images";
import { useTenantState } from "@/lib/tenant-context";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { CalendarCheck, IdCard, Trophy } from "lucide-react";
import { CricketArt } from "./CricketArt";
import { pickPreset } from "@/lib/theme-presets";
import { AcademyLogo } from "./AcademyLogo";

export interface AcademyBrand {
  name: string;
  initials: string;
  accent: string;
  ink: string;
  surface: string;
  brandAccent: string;
  logoPath: string | null;
  tagline: string | null;
  heroImages: string[];
  resolved: boolean;
}

/** Resolves brand identity for the auth surface from the current tenant (hostname-based). */
export function useAcademyBrand(): AcademyBrand {
  const state = useTenantState();
  const tenant = state.status === "ready" || state.status === "suspended" ? state.tenant : null;
  return useMemo(() => {
    // Platform door (academy.nevorai.com / no tenant resolved): Nevorai Academy's own identity.
    // Deliberate, not a fallback — never show a tenant's palette here.
    if (!tenant) {
      return {
        name: "Nevorai Academy",
        initials: "AOS",
        accent: "#C8452F",
        ink: "#0A1628",
        surface: "#060E1C",
        brandAccent: "#E0654D",
        logoPath: null,
        tagline: null,
        heroImages: [],
        resolved: false,
      };
    }

    const name = tenant.name ?? "Nevorai Academy";
    const initials =
      (tenant.short_name?.trim() ||
        name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")) ?? "A";
    
    // Owner-uploaded login artwork wins; otherwise reuse the homepage hero.
    const login = getPageHeroImages(tenant, "login");
    const heroImages = login.length > 0 ? login : getPageHeroImages(tenant, "home");

    // Same chain the rest of the app uses: owner's colors win, niche preset fills the gap.
    const preset = pickPreset(tenant.niche, tenant.slug);

    return {
      name,
      initials: initials.slice(0, 3).toUpperCase(),
      accent: tenant.primary_color || preset.accent, // FIX: Use preset.accent for the glow, not primary
      ink: tenant.secondary_color || preset.ink,
      surface: preset.surface,
      brandAccent: preset.accent,
      logoPath: tenant.logo_url ?? null,
      tagline: tenant.tagline ?? null,
      heroImages,
      resolved: true,
    };
  }, [tenant]);
}

const PERKS = [
  { icon: CalendarCheck, text: "Attendance and fees, always up to date" },
  { icon: Trophy, text: "Live scores and the match centre" },
  { icon: IdCard, text: "Your player card, stats and progress" },
];

/** True from the lg breakpoint up. Starts false so the server and the first paint match. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

/**
 * Member-portal shell. Desktop: a turf-green art panel (cricket ground drawn in lines, bat and balls, the
 * academy's own photos faded in when it has them) beside the form. Phone: a short green art band with the
 * academy mark, and the form on a sheet that overlaps it. The form side follows the Light/Dark switch; the
 * art side is always green. Colours come from the --auth-* tokens.
 */
export function AcademyAuthLayout({ children }: { children: ReactNode }) {
  const brand = useAcademyBrand();
  const wide = useWide();
  const hasArt = brand.heroImages.length > 0;

  return (
    <div className="auth-surface relative min-h-dvh w-full overflow-x-clip bg-auth-bg text-auth-foreground lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative isolate flex h-[184px] flex-col justify-between overflow-hidden bg-[#0b2616] px-5 pb-9 pt-[max(1.25rem,var(--app-safe-top))] text-white lg:sticky lg:top-0 lg:h-dvh lg:px-12 lg:py-12">
        <div className="absolute inset-0 -z-30 bg-[linear-gradient(160deg,#0b2616_0%,#0f3a22_55%,#145232_100%)]" />
        {wide && hasArt ? (
          <div className="absolute inset-0 -z-20 opacity-30">
            <HeroCarousel paths={brand.heroImages} scrim={false} intervalMs={7000} />
          </div>
        ) : null}
        {/* Mown stripes. */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 56px, transparent 56px 112px)",
          }}
        />
        <CricketArt className="absolute inset-0 -z-10 h-full w-full lg:hidden" align="top" />
        <CricketArt className="absolute inset-0 -z-10 hidden h-full w-full lg:block" align="mid" />
        <div className="absolute inset-x-0 bottom-0 -z-10 hidden h-3/5 bg-gradient-to-t from-[#07180e]/85 to-transparent lg:block" />

        <Link to="/" className="relative flex min-w-0 items-center gap-3 self-start">
          <AcademyLogo
            path={brand.logoPath}
            name={brand.name}
            initials={brand.initials}
            accent="#0f3a22"
            className="size-10 border-white/25! bg-white! lg:size-11"
          />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold tracking-tight">{brand.name}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E2B857]">
              Member portal
            </span>
          </span>
        </Link>

        <div className="relative hidden lg:block">
          <h2 className="max-w-[520px] text-[44px] font-semibold leading-[1.05] tracking-tight">
            {brand.tagline || "Train. Play. Grow."}
          </h2>
          <ul className="mt-8 space-y-3.5">
            {PERKS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[15px] text-white/85">
                <span className="grid size-9 place-items-center rounded-lg border border-white/15 bg-white/10">
                  <Icon className="size-[18px] text-[#E2B857]" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <ThemeSwitch />

      <div className="relative z-10 -mt-5 flex min-h-[calc(100dvh-164px)] flex-col rounded-t-[20px] bg-auth-bg lg:mt-0 lg:min-h-dvh lg:rounded-none">
        <main className="flex flex-1 items-center justify-center px-5 pb-8 pt-8 sm:px-8 lg:py-14">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[400px]"
          >
            {children}
          </motion.div>
        </main>

        <footer className="px-5 pb-[max(1.5rem,var(--app-safe-bottom))] text-center sm:px-8">
          <Link to="/" className="inline-block py-2 text-[12px] text-auth-subtle transition-colors hover:text-auth-foreground">
            ← Back to {brand.resolved ? "academy website" : "home"}
          </Link>
        </footer>
      </div>
    </div>
  );
}

/**
 * Light/Dark switch, pinned top right. Two explicit choices, no "system". Writes through the app's existing
 * theme engine (ThemeToggle), so the choice persists and matches the rest of the product. On a phone it sits
 * on the green band (white), on desktop on the form side (theme colours).
 */
function ThemeSwitch() {
  // SSR renders a stable value; the stored preference is applied on mount.
  const [mode, setMode] = useState<"light" | "dark">("dark");

  useEffect(() => {
    setMode(resolveTheme(readStoredThemeMode()));
  }, []);

  function choose(next: "light" | "dark") {
    setMode(next);
    setStoredThemeMode(next);
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="absolute right-4 top-[max(1rem,var(--app-safe-top))] z-20 inline-flex items-center rounded-lg border border-white/30 p-0.5 lg:right-8 lg:top-8 lg:border-auth-border"
    >
      {(["light", "dark"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => choose(opt)}
          aria-pressed={mode === opt}
          data-active={mode === opt}
          className="rounded-md px-3 py-1 text-[11px] font-medium capitalize text-white/80 transition-colors data-[active=true]:bg-white data-[active=true]:text-[#0b2616] lg:text-auth-subtle lg:data-[active=true]:bg-auth-foreground lg:data-[active=true]:text-auth-bg"
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
