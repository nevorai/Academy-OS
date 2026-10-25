/**
 * Home page, first half: hero, about, what we teach, and the batches.
 * No scroll animations and nothing that starts hidden, so the page is finished from the first paint.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, MapPin, Phone } from "lucide-react";
import type { Tenant } from "@/lib/tenant";
import { oneLineAddress } from "@/lib/public-site";
import { OverDots, HeroGround, PitchPlan, PillarIcon, BallMark } from "./art";
import { PACKS } from "./copy";
import { rupees, type HomeModel } from "./model";
import { useMediaUrl } from "./use-media-url";
import { Lucide } from "./lucide-pillar";

export const WRAP = "mx-auto w-[min(1320px,94%)]";
export const BTN =
  "inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-3.5 text-[15px] font-semibold transition-[transform,background-color,border-color] active:scale-[0.98]";
export const BTN_BRAND = `${BTN} bg-[var(--brand)] text-white hover:brightness-110`;
export const BTN_LIGHT = `${BTN} bg-white text-[#0A0F1A] hover:bg-white/90`;
export const BTN_GHOST_DARK = `${BTN} border border-white/30 text-white hover:bg-white/10`;
export const BTN_GHOST_LIGHT = `${BTN} border border-[#0A0F1A]/25 text-[#0A0F1A] hover:bg-[#0A0F1A]/5`;
const ACCENT_ON_DARK = "text-[color-mix(in_srgb,var(--brand)_42%,white)]";

export function SectionHead({
  n,
  label,
  title,
  lead,
  dark = false,
  onBrand = false,
  className = "",
}: {
  n: number;
  label: string;
  title: string;
  lead?: string;
  dark?: boolean;
  /** The band is the academy's own colour: label and dots turn white. */
  onBrand?: boolean;
  className?: string;
}) {
  return (
    <div className={`max-w-3xl ${className}`}>
      <div className={`flex items-center gap-3 ${dark ? "text-white" : "text-[#0A0F1A]"}`}>
        <OverDots filled={((n - 1) % 6) + 1} onBrand={onBrand} />
        <span
          className={`text-xs font-bold uppercase tracking-[0.22em] ${onBrand ? "text-white/85" : dark ? ACCENT_ON_DARK : "text-[var(--brand)]"}`}
        >
          {label}
        </span>
      </div>
      <h2
        className={`mt-4 font-[family-name:var(--font-display)] text-[clamp(1.9rem,4.2vw,3.2rem)] font-extrabold leading-[1.05] tracking-tight ${dark ? "text-white" : "text-[#0A0F1A]"}`}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className={`mt-4 text-[17px] leading-relaxed ${dark ? "text-white/70" : "text-[#0A0F1A]/70"}`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- hero */

export function Hero({ tenant, m }: { tenant: Tenant; m: HomeModel }) {
  const media = useMediaUrl(m.hero.mediaPath);
  const pack = PACKS[m.pack];
  const phone = tenant.phone?.trim();
  const showBatches = m.batches.length > 0;
  const ribbon = m.facts.length >= 2 ? m.facts : [];
  return (
    <section className="relative isolate overflow-hidden bg-[#070B14] text-white">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 520px at 12% 0%, color-mix(in srgb, var(--brand) 55%, transparent), transparent 62%), radial-gradient(700px 420px at 95% 100%, color-mix(in srgb, var(--brand) 30%, transparent), transparent 65%), linear-gradient(180deg, #070B14, #0A1120)",
        }}
      />
      {media && m.hero.mediaIsVideo ? (
        <video
          src={media}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-45"
        />
      ) : media ? (
        <img
          src={media}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-45"
        />
      ) : null}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#070B14]/85 via-[#070B14]/45 to-transparent" />
      <HeroGround className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-white/[0.12]" />

      <div
        className={`${WRAP} grid gap-10 pb-12 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end lg:pb-16 lg:pt-28`}
      >
        <div>
          <div className="inline-flex items-center gap-2.5 rounded-md border border-white/20 bg-black/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-white/85 backdrop-blur-sm">
            <BallMark size={16} />
            {pack.label}
            {m.town ? <span className="text-white/55">· {m.town}</span> : null}
          </div>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(2.6rem,7.2vw,5.6rem)] font-extrabold leading-[0.98] tracking-tight">
            {m.hero.headline}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80 sm:text-xl">
            {m.hero.sub}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/register" className={BTN_BRAND}>
              {m.hero.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
            {phone ? (
              <a href={`tel:${phone}`} className={BTN_GHOST_DARK}>
                <Phone className="h-4 w-4" />
                {phone}
              </a>
            ) : null}
          </div>
        </div>

        {showBatches ? (
          <aside
            className="rounded-xl border border-white/15 bg-black/40 p-5 backdrop-blur-md sm:p-6"
            aria-label="Training timings"
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-[11px] font-bold uppercase tracking-[0.24em] ${ACCENT_ON_DARK}`}
              >
                Training timings
              </span>
              <Clock className="h-4 w-4 text-white/50" />
            </div>
            <ul className="mt-4 divide-y divide-white/10">
              {m.batches.slice(0, 4).map((b) => (
                <li key={b.id} className="flex items-baseline justify-between gap-4 py-3">
                  <span className="text-[15px] font-semibold leading-snug">{b.name}</span>
                  {b.timing ? (
                    <span className="shrink-0 text-sm tabular-nums text-white/70">{b.timing}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <Link to="/register" className={`${BTN_LIGHT} mt-4 w-full`}>
              Join a batch
              <ArrowRight className="h-4 w-4" />
            </Link>
          </aside>
        ) : null}
      </div>

      {ribbon.length ? (
        <div className="border-t border-white/12 bg-black/35 backdrop-blur-sm">
          <dl
            className={`${WRAP} grid grid-cols-2 gap-x-6 gap-y-5 py-6 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]`}
          >
            {ribbon.map((f, i) => (
              <div
                key={i}
                className="min-w-0 border-l-2 border-[var(--brand)] pl-4 [&:last-child:nth-child(odd)]:col-span-2 sm:[&:last-child:nth-child(odd)]:col-span-1"
              >
                <dt className="sr-only">{f.label}</dt>
                <dd>
                  {f.figure ? (
                    <span className="block font-[family-name:var(--font-display)] text-3xl font-extrabold leading-none sm:text-4xl">
                      {f.figure}
                    </span>
                  ) : null}
                  <span className="mt-1.5 block text-sm leading-snug text-white/70">{f.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------- about */

export function About({ tenant, m }: { tenant: Tenant; m: HomeModel }) {
  if (!m.about) return null;
  const where = oneLineAddress(tenant.address);
  return (
    <section className="bg-[#F4F1E9] py-16 text-[#0A0F1A] sm:py-24" id="about">
      <div
        className={`${WRAP} grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center`}
      >
        <div>
          <SectionHead n={1} label="About the academy" title={m.about.heading} />
          {m.about.body ? (
            <p className="mt-6 max-w-2xl whitespace-pre-line text-lg leading-relaxed text-[#0A0F1A]/75">
              {m.about.body}
            </p>
          ) : null}
          <ul className="mt-8 grid gap-3 text-[15px] sm:grid-cols-2">
            {where ? (
              <li className="flex gap-3 rounded-[10px] border border-[#0A0F1A]/12 bg-white p-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
                <span className="leading-snug text-[#0A0F1A]/80">{where}</span>
              </li>
            ) : null}
            {m.batches.length ? (
              <li className="flex gap-3 rounded-[10px] border border-[#0A0F1A]/12 bg-white p-4">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" />
                <span className="leading-snug text-[#0A0F1A]/80">
                  {m.batches.length} training {m.batches.length === 1 ? "batch" : "batches"} a day
                  to choose from
                </span>
              </li>
            ) : null}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/about" className={BTN_GHOST_LIGHT}>
              More about us
            </Link>
          </div>
        </div>
        {m.pack === "cricket" ? (
          <div className="relative mx-auto w-full max-w-[420px] text-[#0A0F1A]">
            <PitchPlan className="h-auto w-full" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ pillars */

export function Pillars({ m }: { m: HomeModel }) {
  const c = PACKS[m.pack];
  return (
    <section className="bg-white py-16 text-[#0A0F1A] sm:py-24" id="training">
      <div className={WRAP}>
        <SectionHead n={2} label="Training" title={c.pillarsTitle} lead={c.pillarsLead} />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {c.pillars.map((p, i) => (
            <article
              key={p.title}
              className="group relative overflow-hidden rounded-xl border border-[#0A0F1A]/12 bg-[#F4F1E9] p-6 transition-colors hover:border-[var(--brand)]"
            >
              <span className="absolute right-4 top-3 font-[family-name:var(--font-display)] text-5xl font-extrabold text-[#0A0F1A]/[0.06]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="grid h-14 w-14 place-items-center rounded-[10px] bg-[var(--brand)] text-white">
                {p.icon.startsWith("lucide:") ? (
                  <Lucide name={p.icon.slice(7)} className="h-7 w-7" />
                ) : (
                  <PillarIcon kind={p.icon as "bat"} className="h-8 w-8" />
                )}
              </div>
              <h3 className="mt-5 font-[family-name:var(--font-display)] text-xl font-bold">
                {p.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[#0A0F1A]/70">{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ batches */

export function Batches({ m }: { m: HomeModel }) {
  if (!m.batches.length) return null;
  const c = PACKS[m.pack];
  return (
    <section
      className="relative overflow-hidden bg-[#0A0F1A] py-16 text-white sm:py-24"
      id="batches"
    >
      <div className={WRAP}>
        <SectionHead
          n={3}
          label="Batches and timings"
          title={c.programsTitle}
          lead={c.programsLead}
          dark
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {m.batches.map((b) => (
            <article
              key={b.id}
              className="flex flex-col overflow-hidden rounded-xl border border-white/15 bg-white/[0.04]"
            >
              <div className="p-5">
                <div
                  className={`text-[11px] font-bold uppercase tracking-[0.22em] ${ACCENT_ON_DARK}`}
                >
                  Batch
                </div>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold leading-snug">
                  {b.name}
                </h3>
                {b.timing ? (
                  <div className="mt-4 flex items-center gap-2 text-[15px] tabular-nums text-white/80">
                    <Clock className="h-4 w-4 text-white/50" />
                    {b.timing}
                  </div>
                ) : null}
              </div>
              <div className="relative mt-auto">
                <div className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-[#0A0F1A]" />
                <div className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-[#0A0F1A]" />
                <div className="border-t border-dashed border-white/25 p-5">
                  {m.showPricing && b.fee != null ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-[family-name:var(--font-display)] text-3xl font-extrabold">
                        {rupees(b.fee)}
                      </span>
                      <span className="text-sm text-white/60">a month</span>
                    </div>
                  ) : (
                    <div className="text-sm text-white/60">Fees on request</div>
                  )}
                  <Link to="/register" className={`${BTN_LIGHT} mt-4 w-full`}>
                    Join this batch
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
