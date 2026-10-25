import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TenantGate } from "@/components/site/TenantGate";
import { isPlatformRequest, platformJsonLd, seo } from "@/lib/seo";
import { useTenant } from "@/lib/tenant-context";
import { batchesQuery, feePlansQuery, siteContentQuery } from "@/lib/site-queries";
import { directMediaUrl } from "@/lib/media-paths";
import type { PublicSiteBundle } from "@/lib/public-site";
import { buildHomeModel } from "@/components/site/home/model";
import { About, Batches, Hero, Pillars } from "@/components/site/home/sections-top";
import {
  Founder,
  MatchCentre,
  Session,
  Spotlights,
  Stars,
} from "@/components/site/home/sections-mid";
import { Closing, Faq, Fees, Gallery, Visit } from "@/components/site/home/sections-end";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/")({
  // One route, two audiences: the platform marketing site on a reserved host
  // (academyos.nevorai.com) and each academy's own site on its subdomain or
  // custom domain. Decided from the request Host header at SSR time — link
  // unfurlers (WhatsApp, Facebook) never run the JS that patches titles later.
  head: ({ matches }) => {
    if (isPlatformRequest()) {
      return seo({
        title: "Academy, Gym & Coaching Software for India | Nevorai Academy",
        description:
          "Run your academy, gym or coaching institute on one system — admissions, fee collection and reminders, attendance, batches and your own website. Cricket academies also get live match scoring. Built in India by Nevorai.",
        path: "/",
        keywords:
          "academy management software India, gym management software, coaching institute software, cricket academy software, cricket academy management software, cricket academy management system, sports academy software India, cricket coaching management software, academy fee management software, cricket academy app",
        jsonLd: platformJsonLd(),
      });
    }
    // The academy's own title, description and picture, from what the server already read.
    const site = (matches[0]?.loaderData as { site?: PublicSiteBundle | null } | undefined)?.site;
    const t = site?.tenant;
    if (!t) {
      return seo({
        title: "Academy — Coaching, Batches, Fees & Updates",
        description:
          "Professional coaching, flexible batches and transparent fees. Register online in minutes.",
        path: "/",
      });
    }
    const about = site?.siteContent?.find((s) => s.section === "about")?.content as
      | { body?: string }
      | undefined;
    const description = (
      about?.body?.trim() ||
      t.tagline ||
      `${t.name} — coaching, batches and fees. Register online in minutes.`
    )
      .replace(/\s+/g, " ")
      .slice(0, 200);
    return seo({
      title: t.tagline ? `${t.name} — ${t.tagline}` : t.name,
      description,
      path: "/",
      image: directMediaUrl(t.logo_url) || undefined,
    });
  },
  // The page is the same for every visitor, so let the CDN keep it for a few minutes: an owner's edit
  // shows up within five minutes, and a repeat visit does not reach the server at all.
  headers: () => ({
    "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
  }),
  component: HomeRoute,
});

function HomeRoute() {
  // Installed PWA (standalone display-mode) users should never see the
  // marketing site — old installs still have start_url="/" cached. Bounce
  // them to /app-launch which restores the session and routes to /dashboard
  // or /auth. Guests in a normal browser tab still see the public homepage.
  useStandaloneAppRedirect();

  return (
    <TenantGate>
      <HomeContent />
    </TenantGate>
  );
}

function useStandaloneAppRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari's non-standard flag
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      // Android / Chrome TWA / PWA detection
      window.matchMedia?.("(display-mode: minimal-ui)").matches ||
      document.referrer.includes("android-app://");

    if (isStandalone) {
      navigate({ to: "/app-launch", replace: true });
    }
  }, [navigate]);
}

function HomeContent() {
  const tenant = useTenant();
  const { site } = rootApi.useLoaderData() as { site: PublicSiteBundle | null };
  // The server already read these for the first paint; the queries keep them fresh afterwards.
  const { data: sections = [] } = useQuery({
    ...siteContentQuery(tenant.id),
    initialData: site?.siteContent ?? undefined,
  });
  const { data: fees = [] } = useQuery({
    ...feePlansQuery(tenant.id),
    initialData: site?.feePlans ?? undefined,
  });
  const { data: batches = [] } = useQuery({
    ...batchesQuery(tenant.id),
    initialData: site?.batches ?? undefined,
  });

  const m = useMemo(
    () => buildHomeModel({ tenant, sections, fees, batches }),
    [tenant, sections, fees, batches],
  );

  return (
    <div className="pub-home lp-root font-[family-name:var(--font-sans)]">
      <Hero tenant={tenant} m={m} />
      <About tenant={tenant} m={m} />
      <Pillars m={m} />
      <Batches m={m} />
      <Founder tenant={tenant} m={m} />
      <Stars m={m} />
      <Spotlights m={m} />
      <MatchCentre m={m} />
      <Session m={m} />
      <Gallery m={m} />
      <Fees m={m} />
      <Faq tenant={tenant} m={m} />
      <Visit tenant={tenant} m={m} />
      <Closing tenant={tenant} m={m} />
    </div>
  );
}
