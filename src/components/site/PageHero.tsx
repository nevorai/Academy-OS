import type { ReactNode } from "react";
import { useTenant } from "@/lib/tenant-context";
import { HeroCarousel } from "./HeroCarousel";
import { OverDots } from "./home/art";
import { packFor } from "./home/model";
import { WRAP } from "./home/sections-top";
import { getPageHeroImages, type PageHeroKey } from "@/lib/page-hero-images";

/** The last word of the title in the accent colour. */
function AccentTail({ text }: { text: string }) {
  const trimmed = text.trimEnd();
  const i = trimmed.lastIndexOf(" ");
  if (i < 0) return <>{text}</>;
  return (
    <>
      {trimmed.slice(0, i + 1)}
      <span className="text-[var(--pub-hot)]">{trimmed.slice(i + 1)}</span>
    </>
  );
}

/**
 * Shared hero for the inner public pages (About, Programs, Gallery, Fees, Contact, Coaches, Achievements,
 * Star Players). A night band with a bright accent, the same look as the home page. Everything is visible from
 * the first paint: nothing fades in and nothing moves. When the tenant has uploaded background photos for this
 * page they sit behind a dark scrim so the title stays readable.
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
  pageKey,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  pageKey?: PageHeroKey;
}) {
  const tenant = useTenant();
  const heroImages = pageKey ? getPageHeroImages(tenant, pageKey) : [];
  const hasImages = heroImages.length > 0;
  return (
    <section
      data-pack={packFor(tenant.niche)}
      className="relative isolate overflow-hidden bg-[#070B14] text-white"
    >
      {hasImages ? <HeroCarousel paths={heroImages} /> : null}
      {hasImages ? (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,11,20,0.55),rgba(7,11,20,0.85))]" />
      ) : null}
      {/* Floodlight glow: the accent top right, the academy colour bottom left */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 90% at 88% 0%, color-mix(in srgb, var(--pub-hot) 16%, transparent), transparent 65%), radial-gradient(55% 80% at 0% 100%, color-mix(in srgb, var(--brand) 55%, transparent), transparent 70%)",
        }}
      />
      {/* Fine grid, fading out towards the edges */}
      <div
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-0 " +
          (hasImages ? "opacity-[0.05]" : "opacity-[0.09]")
        }
        style={{
          backgroundImage:
            "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at 30% 40%, black 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at 30% 40%, black 30%, transparent 78%)",
        }}
      />

      <div className={`${WRAP} relative py-14 sm:py-20 lg:py-24`}>
        <div className="flex items-center gap-3">
          <OverDots filled={1} dark />
          <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--pub-hot)]">
            {eyebrow}
          </span>
        </div>
        <h1 className="mt-4 max-w-4xl font-[family-name:var(--font-display)] text-[clamp(2.4rem,6vw,4.75rem)] font-extrabold leading-[1.02] tracking-tight text-white">
          <AccentTail text={title} />
        </h1>
        {subtitle ? (
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-white/75 sm:text-lg">
            {subtitle}
          </p>
        ) : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,var(--pub-hot),rgba(255,255,255,0.12)_45%,transparent)] opacity-70"
      />
    </section>
  );
}
