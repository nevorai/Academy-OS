/**
 * Turns an academy's rows (tenant, site content, fee plans, batches) into what the home page draws.
 * Pure functions, no React, so the rules (what shows, what stays hidden) are easy to test.
 */
import type { Batch, FeePlan, SiteContent, Tenant } from "@/lib/tenant";
import { townFromAddress } from "@/lib/public-site";
import {
  normalizeStar,
  pickFeatured,
  type RawStarPlayer,
} from "@/components/site/StarPlayersShowcase";

export type Pack = "cricket" | "gym" | "learning";

/** Which wording and artwork an academy gets, from its niche. Cricket is the platform's first sport. */
export function packFor(niche: string | null | undefined): Pack {
  if (niche === "gym") return "gym";
  if (niche === "tuition" || niche === "dance" || niche === "music") return "learning";
  return "cricket";
}

export type Fact = { figure: string | null; label: string };

/** "800+ students trained" becomes figure "800+" and label "students trained". */
export function parseFact(text: string): Fact | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\S*\d\S*)\s+(.+)$/);
  return m ? { figure: m[1], label: m[2] } : { figure: null, label: t };
}

type Hero = {
  headline?: string;
  subheadline?: string;
  cta_label?: string;
  background_url?: string;
  background_type?: "image" | "video" | "";
};
type About = { heading?: string; body?: string };
type Founder = {
  name?: string;
  title?: string;
  credentials?: string;
  bio?: string;
  photo_url?: string | null;
};
type Person = { name?: string; role?: string; bio?: string; photo_url?: string | null };
type Cta = {
  headline?: string;
  subheadline?: string;
  background_url?: string;
  background_type?: "image" | "video" | "";
};
type MapContent = { embed_url?: string; directions_url?: string };

export type BatchView = { id: string; name: string; timing: string | null; fee: number | null };

export type HomeModel = {
  pack: Pack;
  town: string | null;
  hero: { headline: string; sub: string; cta: string; mediaPath: string; mediaIsVideo: boolean };
  about: { heading: string; body: string } | null;
  facts: Fact[];
  batches: BatchView[];
  founder: {
    name: string;
    title: string;
    credentials: string;
    bio: string;
    photo: string | null;
  } | null;
  coaches: Array<{ name: string; role: string; photo: string | null }>;
  stars: ReturnType<typeof pickFeatured>;
  spotlights: Array<{ name: string; role: string; bio: string; photo: string | null }>;
  gallery: string[];
  galleryTotal: number;
  showPricing: boolean;
  monthly: FeePlan[];
  registration: FeePlan | null;
  cta: { headline: string; sub: string; mediaPath: string; mediaIsVideo: boolean };
  map: { embedUrl: string | null; linkUrl: string | null };
};

const one = <T>(sections: SiteContent[], key: string): T | null => {
  const row = sections.find((s) => s.section === key);
  return row ? (row.content as T) : null;
};
const all = <T>(sections: SiteContent[], key: string): T[] =>
  sections.filter((s) => s.section === key).map((s) => s.content as T);

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function mapLinks(tenant: Tenant, map: MapContent | null) {
  const raw = clean(map?.embed_url);
  const embeddable = raw.includes("google.com/maps/embed") || /[?&]output=embed(&|$)/.test(raw);
  const direct = clean(map?.directions_url);
  const query = tenant.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address.replace(/\s+/g, " "))}`
    : null;
  return {
    embedUrl: embeddable ? raw : null,
    linkUrl: direct || (raw && !embeddable && /^https?:\/\//.test(raw) ? raw : query),
  };
}

/** Minutes after midnight of the first clock time in "6:30 AM – 9:00 AM", or null. */
export function startMinutes(timing: string | null | undefined): number | null {
  const m = timing?.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0);
  return h * 60 + Number(m[2] ?? 0);
}

export function buildHomeModel(input: {
  tenant: Tenant;
  sections: SiteContent[];
  fees: FeePlan[];
  batches: Batch[];
}): HomeModel {
  const { tenant, sections, fees, batches } = input;
  const pack = packFor(tenant.niche);
  const hero = one<Hero>(sections, "hero");
  const about = one<About>(sections, "about");
  const founder = one<Founder>(sections, "founder");
  const cta = one<Cta>(sections, "cta");
  const pricing = one<{ visible?: string }>(sections, "pricing");
  const showPricing = pricing?.visible === "true";

  const monthly = fees.filter((f) => f.type === "monthly");
  const feeOf = (id: string | null) =>
    id ? (fees.find((f) => f.id === id)?.amount ?? null) : null;

  const stars = all<RawStarPlayer>(sections, "star_players")
    .map(normalizeStar)
    .filter((p) => p.name);
  const galleryAll = all<{ url?: string }>(sections, "gallery")
    .map((g) => clean(g.url))
    .filter(Boolean);

  const facts = all<{ text?: string }>(sections, "achievements")
    .map((a) => parseFact(clean(a.text)))
    .filter((f): f is Fact => f !== null)
    .slice(0, 4);

  const bio = clean(founder?.bio);
  const founderName = clean(founder?.name);

  return {
    pack,
    town: townFromAddress(tenant.address),
    hero: {
      headline: clean(hero?.headline) || tenant.tagline || tenant.name,
      sub:
        clean(hero?.subheadline) ||
        `Professional training, clear fees and a home for every player at ${tenant.name}.`,
      cta: clean(hero?.cta_label) || "Register now",
      mediaPath: clean(hero?.background_url),
      mediaIsVideo: hero?.background_type === "video",
    },
    about:
      clean(about?.body) || clean(about?.heading)
        ? { heading: clean(about?.heading) || `About ${tenant.name}`, body: clean(about?.body) }
        : null,
    facts,
    // Earliest session first; a batch with no stated time goes last.
    batches: batches
      .map((b) => ({
        id: b.id,
        name: b.name,
        timing: clean(b.timing) || null,
        fee: feeOf(b.fee_plan_id),
      }))
      .sort((a, b) => (startMinutes(a.timing) ?? 9999) - (startMinutes(b.timing) ?? 9999)),
    founder: founderName
      ? {
          name: founderName,
          title: clean(founder?.title),
          credentials: clean(founder?.credentials),
          bio,
          photo: founder?.photo_url ?? null,
        }
      : null,
    coaches: all<Person>(sections, "coaches")
      .filter((c) => clean(c.name))
      .map((c) => ({ name: clean(c.name), role: clean(c.role), photo: c.photo_url ?? null })),
    stars: pickFeatured(stars),
    spotlights: all<Person>(sections, "spotlight")
      .filter((p) => clean(p.name))
      .map((p) => ({
        name: clean(p.name),
        role: clean(p.role),
        bio: clean(p.bio),
        photo: p.photo_url ?? null,
      })),
    gallery: galleryAll.slice(0, 7),
    galleryTotal: galleryAll.length,
    showPricing,
    monthly: monthly.slice(0, 3),
    registration: fees.find((f) => f.type === "registration") ?? null,
    cta: {
      headline: clean(cta?.headline) || `Ready to join ${tenant.name}?`,
      sub: clean(cta?.subheadline) || clean(hero?.subheadline) || tenant.tagline || "",
      mediaPath: clean(cta?.background_url),
      mediaIsVideo: cta?.background_type === "video",
    },
    map: mapLinks(tenant, one<MapContent>(sections, "map")),
  };
}

/** Indian rupee amount with lakh grouping, e.g. ₹1,500. */
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
