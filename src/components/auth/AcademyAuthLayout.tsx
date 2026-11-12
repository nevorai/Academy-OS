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
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0])
          .join("")) ??
      "A";

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

/**
 * Member-portal shell, Metrol style: one centred card on a quiet ground, the academy mark on top, a
 * Light/Dark switch in the corner. No art panel. Colours come from the --auth-* tokens (neutral black and
 * white, so every academy looks premium; the academy's own logo and name carry the brand).
 */
export function AcademyAuthLayout({ children }: { children: ReactNode }) {
  const brand = useAcademyBrand();

  return (
    <div className="auth-surface relative flex min-h-dvh w-full flex-col overflow-x-clip bg-auth-bg text-auth-foreground">
      <ThemeSwitch />
      <main className="flex flex-1 items-center justify-center px-4 pb-6 pt-20 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[420px] rounded-2xl border border-auth-border bg-auth-card px-6 py-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-12px_rgba(0,0,0,0.18)] sm:px-8"
        >
          <Link to="/" className="mb-6 flex min-w-0 items-center gap-3">
            <AcademyLogo
              path={brand.logoPath}
              name={brand.name}
              initials={brand.initials}
              accent="#111111"
              className="size-11"
            />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold tracking-tight">
                {brand.name}
              </span>
              <span className="block text-[11px] font-medium text-auth-subtle">Member portal</span>
            </span>
          </Link>
          {children}
        </motion.div>
      </main>

      <footer className="px-5 pb-[max(1.25rem,var(--app-safe-bottom))] text-center">
        <Link
          to="/"
          className="inline-block py-2 text-[12px] text-auth-subtle transition-colors hover:text-auth-foreground"
        >
          ← Back to {brand.resolved ? "academy website" : "home"}
        </Link>
      </footer>
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
      className="absolute right-4 top-[max(1rem,var(--app-safe-top))] z-20 inline-flex items-center rounded-lg border border-auth-border bg-auth-card p-0.5 sm:right-6"
    >
      {(["light", "dark"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => choose(opt)}
          aria-pressed={mode === opt}
          data-active={mode === opt}
          className="rounded-md px-3 py-1 text-[11px] font-medium capitalize text-auth-subtle transition-colors data-[active=true]:bg-auth-foreground data-[active=true]:text-auth-bg"
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
