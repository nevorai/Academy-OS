/**
 * Home page, last part: photos, fees, questions, how to find us, and the closing call to action.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { Tenant } from "@/lib/tenant";
import { StoragedImage } from "@/components/site/StoragedImage";
import { oneLineAddress } from "@/lib/public-site";
import { PitchPlan, SeamLine } from "./art";
import { rupees, type HomeModel } from "./model";
import { useMediaUrl } from "./use-media-url";
import {
  BTN_BRAND,
  BTN_GHOST_DARK,
  BTN_GHOST_LIGHT,
  BTN_LIGHT,
  SectionHead,
  WRAP,
} from "./sections-top";

const waNumber = (n?: string | null) => n?.replace(/[^\d]/g, "") || "";

/* ------------------------------------------------------------- gallery */

/**
 * Mosaic for seven photos: four columns by three rows with no gaps (a big one, two wide ones, four small).
 * On phones: the big one across two rows, then pairs. Fewer than seven photos get an even grid instead.
 */
const SPANS = ["col-span-2 row-span-2", "", "", "sm:col-span-2", "", "sm:col-span-2", ""];

export function Gallery({ m }: { m: HomeModel }) {
  // Once the page has finished loading, fetch every below-the-fold photo so it is already there
  // when the visitor scrolls (skipped on Data Saver or a slow connection).
  useEffect(() => {
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return;
    const warm = () =>
      document
        .querySelectorAll<HTMLImageElement>('.pub-home img[loading="lazy"]')
        .forEach((img) => {
          img.loading = "eager";
        });
    if (document.readyState === "complete") warm();
    else window.addEventListener("load", warm, { once: true });
    return () => window.removeEventListener("load", warm);
  }, []);

  if (m.gallery.length < 3) return null;
  const mosaic = m.gallery.length >= 7;
  return (
    <section className="bg-white py-16 text-[#0A0F1A] sm:py-24" id="gallery">
      <div className={WRAP}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead n={2} label="Inside the academy" title="Life at the nets" />
          {m.galleryTotal > m.gallery.length ? (
            <Link to="/gallery" className={BTN_GHOST_LIGHT}>
              All {m.galleryTotal} photos
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
        <div
          className={`mt-10 grid grid-cols-2 gap-3 ${
            mosaic
              ? "auto-rows-[150px] sm:auto-rows-[170px] sm:grid-cols-4 lg:auto-rows-[210px]"
              : "auto-rows-[190px] sm:grid-cols-3 lg:auto-rows-[260px]"
          }`}
        >
          {m.gallery.map((p, i) => (
            <div
              key={p}
              className={`overflow-hidden rounded-xl bg-[#F4F1E9] ${mosaic ? (SPANS[i] ?? "") : ""}`}
            >
              <StoragedImage
                path={p}
                alt="Training at the academy"
                lazy
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.04]"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- fees */

export function Fees({ m }: { m: HomeModel }) {
  if (!m.showPricing || !m.monthly.length) return null;
  return (
    <section className="bg-[#F4F1E9] py-16 text-[#0A0F1A] sm:py-24" id="fees">
      <div className={WRAP}>
        <SectionHead
          n={3}
          label="Fees"
          title="Clear fees, no surprises"
          lead={
            m.registration
              ? `A one-time joining fee of ${rupees(m.registration.amount)} applies. Everything else is listed here.`
              : "What each plan costs, listed in full."
          }
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {m.monthly.map((p, i) => {
            const star = i === 1 && m.monthly.length >= 2;
            return (
              <article
                key={p.id}
                className={`flex flex-col rounded-xl border p-7 ${star ? "border-transparent bg-[#0A0F1A] text-white" : "border-[#0A0F1A]/12 bg-white"}`}
              >
                <div
                  className={`text-xs font-bold uppercase tracking-[0.2em] ${star ? "text-[color-mix(in_srgb,var(--brand)_42%,white)]" : "text-[var(--brand)]"}`}
                >
                  {p.name}
                </div>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-[family-name:var(--font-display)] text-4xl font-extrabold">
                    {rupees(p.amount)}
                  </span>
                  <span className={star ? "text-white/60" : "text-[#0A0F1A]/60"}>a month</span>
                </div>
                {p.description ? (
                  <p
                    className={`mt-3 text-[15px] leading-relaxed ${star ? "text-white/75" : "text-[#0A0F1A]/70"}`}
                  >
                    {p.description}
                  </p>
                ) : null}
                <Link to="/register" className={`${star ? BTN_LIGHT : BTN_BRAND} mt-7`}>
                  Register now
                </Link>
              </article>
            );
          })}
        </div>
        <div className="mt-6">
          <Link
            to="/fees"
            className="text-[15px] font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
          >
            See all plans and one-time fees
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- faq */

type Qa = { q: string; a: string };

function questions(tenant: Tenant, m: HomeModel): Qa[] {
  const phone = tenant.phone?.trim();
  const out: Qa[] = [
    {
      q: "How do I register?",
      a: `Use the Register button on this page and fill in the form${phone ? `, or call or WhatsApp us on ${phone}` : ""}. It takes a few minutes.`,
    },
  ];
  out.push({
    q: "What are the batch timings?",
    a: m.batches.length
      ? m.batches.map((b) => (b.timing ? `${b.name}: ${b.timing}` : b.name)).join(". ") + "."
      : `${phone ? `Call us on ${phone}` : "Get in touch"} for the current timings.`,
  });
  if (tenant.address) {
    out.push({ q: "Where is the academy?", a: oneLineAddress(tenant.address) });
  }
  out.push({
    q: "Can parents follow progress?",
    a: "Yes. Parents get their own login to see attendance, fees, match scores and progress in one place.",
  });
  out.push({
    q: "How are fees handled?",
    a: "Fees are recorded online, so you can always see what has been paid and what is due.",
  });
  return out;
}

export function Faq({ tenant, m }: { tenant: Tenant; m: HomeModel }) {
  const qa = questions(tenant, m);
  return (
    <section className="bg-white py-16 text-[#0A0F1A] sm:py-24" id="faq">
      <div className={`${WRAP} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]`}>
        <SectionHead
          n={4}
          label="Questions"
          title="Before you join"
          lead="The things parents ask us most. For anything else, just call."
        />
        <div className="divide-y divide-[#0A0F1A]/12 border-y border-[#0A0F1A]/12">
          {qa.map((x, i) => (
            <details key={x.q} className="group py-1" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {x.q}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#0A0F1A]/25 text-lg leading-none transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pb-5 pr-10 text-[16px] leading-relaxed text-[#0A0F1A]/72">{x.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- visit */

export function Visit({ tenant, m }: { tenant: Tenant; m: HomeModel }) {
  const phone = tenant.phone?.trim();
  const wa = waNumber(tenant.whatsapp ?? tenant.phone);
  const address = oneLineAddress(tenant.address);
  if (!phone && !tenant.email && !address && !m.map.embedUrl) return null;
  return (
    <section className="bg-[#0A0F1A] py-16 text-white sm:py-24" id="contact">
      <div className={`${WRAP} grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
        <div>
          <SectionHead
            n={5}
            label="Visit us"
            title="Find the academy"
            lead="Call, message us on WhatsApp, or use the directions to reach us."
            dark
          />
          <ul className="mt-8 space-y-3">
            {address ? (
              <li className="flex gap-3 rounded-[10px] border border-white/15 bg-white/[0.04] p-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[color-mix(in_srgb,var(--brand)_42%,white)]" />
                <span className="leading-snug text-white/85">{address}</span>
              </li>
            ) : null}
            {phone ? (
              <li>
                <a
                  href={`tel:${phone}`}
                  className="flex gap-3 rounded-[10px] border border-white/15 bg-white/[0.04] p-4 hover:bg-white/[0.08]"
                >
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-[color-mix(in_srgb,var(--brand)_42%,white)]" />
                  <span className="text-white/85">{phone}</span>
                </a>
              </li>
            ) : null}
            {tenant.email ? (
              <li>
                <a
                  href={`mailto:${tenant.email}`}
                  className="flex gap-3 rounded-[10px] border border-white/15 bg-white/[0.04] p-4 hover:bg-white/[0.08]"
                >
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[color-mix(in_srgb,var(--brand)_42%,white)]" />
                  <span className="break-all text-white/85">{tenant.email}</span>
                </a>
              </li>
            ) : null}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            {m.map.linkUrl ? (
              <a href={m.map.linkUrl} target="_blank" rel="noreferrer" className={BTN_BRAND}>
                <MapPin className="h-4 w-4" />
                Get directions
              </a>
            ) : null}
            {wa ? (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noreferrer"
                className={BTN_GHOST_DARK}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
        <div className="relative min-h-[260px] overflow-hidden rounded-xl border border-white/15 bg-white/[0.04]">
          {m.map.embedUrl ? (
            <iframe
              src={m.map.embedUrl}
              title="Location map"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <div className="relative grid h-full min-h-[260px] place-items-center p-8 text-center">
              <PitchPlan className="pointer-events-none absolute inset-0 m-auto h-[92%] w-auto text-white/[0.09]" />
              <div className="relative">
                <Clock className="mx-auto h-8 w-8 text-white/40" />
                <ul className="mt-4 space-y-1.5 text-[15px] text-white/80">
                  {m.batches.slice(0, 4).map((b) => (
                    <li key={b.id}>
                      <span className="font-semibold">{b.name}</span>
                      {b.timing ? <span className="text-white/60"> · {b.timing}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ cta */

export function Closing({ tenant, m }: { tenant: Tenant; m: HomeModel }) {
  const wa = waNumber(tenant.whatsapp ?? tenant.phone);
  const media = useMediaUrl(m.cta.mediaPath);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  // The closing video is only a backdrop: it starts when the band is about to be seen, not at page load.
  useEffect(() => {
    const el = videoRef.current?.parentElement;
    if (!el || !("IntersectionObserver" in window)) {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [media]);

  return (
    <section className="relative isolate overflow-hidden bg-[var(--brand)] text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_85%_20%,rgba(255,255,255,0.16),transparent_55%)]" />
      {media && m.cta.mediaIsVideo ? (
        <div className="absolute inset-0 -z-10">
          <video
            ref={videoRef}
            src={near ? media : undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            className="h-full w-full object-cover opacity-30"
          />
        </div>
      ) : media ? (
        <img
          src={media}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30"
        />
      ) : null}
      <div className="absolute inset-0 -z-10 bg-black/35" />
      <div className={`${WRAP} py-16 text-center sm:py-24`}>
        <SeamLine className="mx-auto mb-8 h-2 w-40 text-white/50" />
        <h2 className="mx-auto max-w-3xl font-[family-name:var(--font-display)] text-[clamp(2rem,5vw,3.6rem)] font-extrabold leading-[1.05] tracking-tight">
          {m.cta.headline}
        </h2>
        {m.cta.sub ? (
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/85">
            {m.cta.sub}
          </p>
        ) : null}
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link to="/register" className={BTN_LIGHT}>
            {m.hero.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
          {wa ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className={BTN_GHOST_DARK}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp us
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
