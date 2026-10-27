/**
 * Building blocks for the inner public pages (About, Programs, Gallery, Fees, Contact, Coaches, Achievements),
 * so they share the home page's night + bright accent look: wide bands, cream cards for parent information,
 * glass cards on night, square 10px buttons. Nothing here fades in or starts hidden.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { OverDots } from "./home/art";
import { packFor } from "./home/model";
import { BTN_GHOST_DARK, BTN_HOT, WRAP } from "./home/sections-top";

/** Cream card on a white band. */
export const CARD_CREAM = "rounded-xl border border-[#0A0F1A]/10 bg-[#F4F1E9] p-6";
/** White card on a cream band. */
export const CARD_WHITE = "rounded-xl border border-[#0A0F1A]/10 bg-white p-6";
/** Glass card on a night band. */
export const CARD_NIGHT = "rounded-xl border border-white/10 bg-white/[0.04] p-6";
/** The card that stands out on a band of the given tone. */
export const cardOn = (tone: "white" | "cream" | "night") =>
  tone === "night" ? CARD_NIGHT : tone === "cream" ? CARD_WHITE : CARD_CREAM;
/** Night button for light bands. */
export const BTN_NIGHT =
  "inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#0A0F1A] px-6 py-3.5 text-[15px] font-semibold text-white transition-[transform,filter] hover:brightness-125 active:scale-[0.98] disabled:opacity-60";
/** The small bold label above a card's title. */
export const LABEL_LIGHT = "text-xs font-bold uppercase tracking-[0.18em] text-[#0A0F1A]/55";
export const LABEL_NIGHT = "text-xs font-bold uppercase tracking-[0.18em] text-white/55";
/** Form fields: 16px so phones do not zoom, a clear focus ring in the accent. */
export const FIELD =
  "mt-1.5 block w-full rounded-[10px] border border-[#0A0F1A]/20 bg-white px-3.5 py-3 text-base text-[#0A0F1A] outline-none transition-colors placeholder:text-[#0A0F1A]/40 focus:border-[#0A0F1A] focus:ring-2 focus:ring-[var(--pub-hot)]";

/** Sets the page's wrapper: the footer sits flush under the last band (see `.pub-inner` in styles.css). */
export function InnerPage({ children }: { children: ReactNode }) {
  return <div className="pub-inner font-[family-name:var(--font-sans)]">{children}</div>;
}

const TONES = {
  white: "bg-white text-[#0A0F1A]",
  cream: "bg-[#F4F1E9] text-[#0A0F1A]",
  night: "bg-[#0A0F1A] text-white",
} as const;

export type Tone = keyof typeof TONES;

export function Band({
  tone = "white",
  children,
  className = "",
  id,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const tenant = useTenant();
  return (
    <section
      id={id}
      data-pack={packFor(tenant.niche)}
      className={`${TONES[tone]} py-14 sm:py-20 ${className}`}
    >
      <div className={WRAP}>{children}</div>
    </section>
  );
}

/** A section title inside a band: six-dot marker, label, big heading, optional lead. */
export function BandHead({
  n = 1,
  label,
  title,
  lead,
  tone = "white",
  className = "",
}: {
  n?: number;
  label: string;
  title: string;
  lead?: string;
  tone?: Tone;
  className?: string;
}) {
  const dark = tone === "night";
  return (
    <div className={`max-w-3xl ${className}`}>
      <div className={`flex items-center gap-3 ${dark ? "text-white" : "text-[#0A0F1A]"}`}>
        <OverDots filled={((n - 1) % 6) + 1} dark={dark} />
        <span
          className={`text-xs font-bold uppercase tracking-[0.22em] ${dark ? "text-[var(--pub-hot)]" : "text-[var(--brand)]"}`}
        >
          {label}
        </span>
      </div>
      <h2
        className={`mt-3 font-[family-name:var(--font-display)] text-[clamp(1.7rem,3.6vw,2.7rem)] font-extrabold leading-[1.08] tracking-tight ${dark ? "text-white" : "text-[#0A0F1A]"}`}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className={`mt-3 text-[17px] leading-relaxed ${dark ? "text-white/70" : "text-[#0A0F1A]/70"}`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}

/** Night tile holding one icon in the accent colour. */
export function IconTile({ children, tone = "white" }: { children: ReactNode; tone?: Tone }) {
  return (
    <div
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-[var(--pub-hot)] ${
        tone === "night" ? "bg-white/10" : "bg-[#0A0F1A]"
      }`}
    >
      {children}
    </div>
  );
}

/** Shown in place of a list the owner has not filled in yet. */
export function EmptyNote({ children, tone = "white" }: { children: ReactNode; tone?: Tone }) {
  return (
    <div
      className={`rounded-xl border border-dashed p-10 text-center sm:p-14 ${
        tone === "night"
          ? "border-white/25 text-white/65"
          : "border-[#0A0F1A]/25 bg-[#F4F1E9] text-[#0A0F1A]/65"
      }`}
    >
      {children}
    </div>
  );
}

/** Closing night band with the one call to action, flush against the footer. */
export function JoinBand({
  title = "Ready to join?",
  text,
  cta = "Register now",
}: {
  title?: string;
  text: string;
  cta?: string;
}) {
  const tenant = useTenant();
  const phone = tenant.phone?.trim();
  return (
    <Band tone="night" className="border-t border-white/10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.7rem,3.6vw,2.7rem)] font-extrabold leading-[1.08] tracking-tight">
            {title}
          </h2>
          <p className="mt-3 text-[17px] leading-relaxed text-white/70">{text}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link to="/register" className={`${BTN_HOT} w-full sm:w-auto`}>
            {cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
          {phone ? (
            <a href={`tel:${phone}`} className={`${BTN_GHOST_DARK} w-full sm:w-auto`}>
              Call {phone}
            </a>
          ) : null}
        </div>
      </div>
    </Band>
  );
}
