import type { ReactNode } from "react";
import { useTenantState } from "@/lib/tenant-context";
import { TenantPlaceholder } from "./TenantPlaceholder";
import { DomainNotConfigured } from "./DomainNotConfigured";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { FloatingWhatsApp } from "./FloatingWhatsApp";

import { isReservedPlatformHost } from "@/lib/tenant";
import { requestHostname } from "@/lib/seo";

/**
 * Wraps public site pages: shows a placeholder when no tenant is resolved,
 * otherwise renders the branded header/footer around the page.
 */
export function TenantGate({
  children,
  chrome = "full",
}: {
  children: ReactNode;
  /**
   * "full"  → branded header + footer + WhatsApp bubble (default public pages)
   * "focus" → distraction-free shell for task flows (register): no footer,
   *           no floating bubble, no "powered by" strip. The page owns its
   *           own fixed header / bottom bar.
   */
  chrome?: "full" | "focus";
}) {
  const state = useTenantState();

  if (state.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    );
  }

  if (state.status === "missing") {
    // Same host on the server and in the browser, so the first HTML matches what the browser draws.
    const host = requestHostname() ?? "";
    // Reserved platform host (academy.nevorai.com, nevorai.com, lovable
    // preview URLs…) → platform marketing site. Any other unknown hostname
    // is a misconfigured domain, not an ad for Nevorai Academy.
    return isReservedPlatformHost(host) ? <TenantPlaceholder /> : <DomainNotConfigured />;
  }

  if (state.status === "suspended") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-950 px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold text-white">Temporarily unavailable</h1>
          <p className="mt-3 text-sm text-neutral-400">
            {state.tenant.name} is not accepting online activity right now. Please check back soon,
            or contact the academy directly.
          </p>
        </div>
      </div>
    );
  }

  if (chrome === "focus") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        {children}
        <TenantJsonLd tenant={state.tenant} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <FloatingWhatsApp />
      <TenantJsonLd tenant={state.tenant} />
    </div>
  );
}

function TenantJsonLd({
  tenant,
}: {
  tenant: {
    id: string;
    name: string;
    slug: string;
    tagline: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    logo_url: string | null;
    custom_domain: string | null;
  };
}) {
  // Built from the host (never window.location) so the server HTML and the browser agree, and crawlers see it.
  const host = requestHostname();
  const url = tenant.custom_domain
    ? `https://${tenant.custom_domain}`
    : host
      ? `${/^(localhost|127\.0\.0\.1)$/.test(host) ? "http" : "https"}://${host}`
      : undefined;
  const logoAbs =
    tenant.logo_url && tenant.logo_url.startsWith("http") ? tenant.logo_url : undefined;
  const data = {
    "@context": "https://schema.org",
    "@type": "SportsClub",
    name: tenant.name,
    description: tenant.tagline ?? undefined,
    url,
    telephone: tenant.phone ?? undefined,
    email: tenant.email ?? undefined,
    address: tenant.address
      ? { "@type": "PostalAddress", streetAddress: tenant.address }
      : undefined,
    logo: logoAbs,
    sameAs: undefined,
  };
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: tenant.name,
    url,
    logo: logoAbs,
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }}
      />
    </>
  );
}
