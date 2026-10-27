import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import { StoragedImage } from "./StoragedImage";
import { LiveMatchBanner } from "./LiveMatchBanner";
import { packFor } from "./home/model";
import { showFeesTab } from "@/lib/page-hero-images";

// Desktop top nav: 7 items. Home = clicking the logo. Owner login lives in the
// footer and mobile menu; Coaches/Achievements/Admissions are reachable from
// About / Fees / Footer + the mobile drawer.
const primaryNav = [
  { to: "/about", label: "About" },
  { to: "/programs", label: "Programs" },
  { to: "/star-players", label: "Star Players" },
  { to: "/matches", label: "Matches" },
  { to: "/gallery", label: "Gallery" },
  { to: "/fees", label: "Fees" },
  { to: "/contact", label: "Contact" },
] as const;

// Full list surfaced in the mobile hamburger so nothing removed from the
// desktop bar becomes unreachable.
const mobileNav = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/programs", label: "Programs" },
  { to: "/coaches", label: "Coaches" },
  { to: "/star-players", label: "Star Players" },
  { to: "/achievements", label: "Achievements" },
  { to: "/matches", label: "Matches" },
  { to: "/gallery", label: "Gallery" },
  { to: "/fees", label: "Fees" },
  { to: "/admissions", label: "Admissions" },
  { to: "/contact", label: "Contact" },
] as const;

const NIGHT = "bg-[#070B14]";

export function SiteHeader() {
  const tenant = useTenant();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const feesVisible = showFeesTab(tenant);
  const desktopNav = feesVisible ? primaryNav : primaryNav.filter((n) => n.to !== "/fees");
  const mobileNavItems = feesVisible ? mobileNav : mobileNav.filter((n) => n.to !== "/fees");
  const pack = packFor(tenant.niche);
  const joinLabel = pack === "cricket" ? "Join the squad" : "Register";
  // On the home page the bar floats over the hero as dark glass; after a small scroll (or on any other page) it is solid.
  const overlay = location.pathname === "/";
  const solid = !overlay || scrolled || open;

  useEffect(() => {
    const check = () => setScrolled(window.scrollY > 24);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  return (
    <>
      <LiveMatchBanner />
      <div
        aria-hidden="true"
        className={cn("pointer-events-none fixed inset-x-0 top-0 z-40", NIGHT)}
        style={{ height: "var(--app-safe-top)" }}
      />
      <div aria-hidden="true" className={NIGHT} style={{ height: "var(--app-safe-top)" }} />
      <header
        data-pack={pack}
        className={cn(
          "sticky z-40 border-b text-white transition-[background-color,border-color] duration-200",
          overlay && "-mb-[65px]",
          solid
            ? "border-white/10 bg-[#070B14]/95 backdrop-blur-xl"
            : "border-white/5 bg-[#070B14]/30 backdrop-blur-md",
        )}
        style={{ top: "var(--app-safe-top)" }}
      >
        <div className="mx-auto flex h-16 w-[min(1320px,94%)] items-center gap-4">
          {/* Lockup — mark shrink-0, text block min-w-0 + truncate so it never wraps */}
          <Link to="/" className="flex min-w-0 items-center gap-3" onClick={() => setOpen(false)}>
            {tenant.logo_url ? (
              <StoragedImage
                path={tenant.logo_url}
                alt={tenant.name}
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
                fallback={
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                    style={{ backgroundColor: "var(--brand)" }}
                  >
                    {tenant.name.charAt(0)}
                  </div>
                }
              />
            ) : (
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {tenant.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0 leading-tight">
              <div className="truncate whitespace-nowrap text-sm font-semibold tracking-tight text-white">
                {tenant.name}
              </div>
              {tenant.tagline ? (
                <div className="hidden truncate whitespace-nowrap text-[11px] text-white/55 lg:block">
                  {tenant.tagline}
                </div>
              ) : null}
            </div>
          </Link>

          {/* Centered nav */}
          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {desktopNav.map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "relative whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "text-white" : "text-white/70 hover:text-white",
                    active &&
                      "after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-[var(--pub-hot)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Auth CTAs */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <Link
              to="/auth"
              className="inline-flex items-center rounded-[10px] border border-white/25 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center rounded-[10px] bg-[var(--pub-hot)] px-5 py-2 text-sm font-bold text-[var(--pub-hot-ink)] transition-[filter] hover:brightness-95"
            >
              {joinLabel}
            </Link>
          </div>

          <button
            type="button"
            className="ml-auto rounded-md p-2 text-white md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open ? (
          <div className="border-t border-white/10 bg-[#070B14] md:hidden">
            <div className="mx-auto flex w-[min(1320px,94%)] flex-col py-2">
              {mobileNavItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-3 text-sm font-medium text-white/90 hover:bg-white/10"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                to="/register"
                onClick={() => setOpen(false)}
                className="mx-1 my-2 rounded-[10px] bg-[var(--pub-hot)] px-4 py-3 text-center text-sm font-bold text-[var(--pub-hot-ink)]"
              >
                {pack === "cricket" ? "Join the squad" : "Register Now"}
              </Link>
              <Link
                to="/auth"
                onClick={() => setOpen(false)}
                className="mx-1 mb-2 rounded-[10px] border border-white/25 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
}
