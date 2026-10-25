import type { Batch, FeePlan, SiteContent, Tenant } from "./tenant";

/**
 * Everything an academy's public pages need for their first paint, fetched once on the
 * server (see public-site.functions.ts) so the HTML that arrives is already finished.
 * `null` for a list means "not asked for on this page" (the page falls back to its own query).
 */
export type PublicSiteBundle = {
  tenant: Tenant | null;
  siteContent: SiteContent[] | null;
  feePlans: FeePlan[] | null;
  batches: Batch[] | null;
};

/** Pages that draw the academy's website, so they get the content bundle too (not the app screens). */
const APP_PREFIX =
  /^\/(dashboard|match-center|coach|platform-admin|student|parent|scorer|auth|api|checkin|invite|activate|app-launch)(\/|$)/;

export function isPublicSitePath(pathname: string): boolean {
  return !APP_PREFIX.test(pathname);
}

/** Hostnames and slugs are letters, digits, dots and dashes; anything else is never a tenant. */
export function isSafeHostToken(value: string): boolean {
  return /^[a-z0-9]([a-z0-9.-]{0,118}[a-z0-9])?$/i.test(value);
}

/** The town in a street address, for a small label ("Chhatarpur"): skips the country and the state-and-pincode part. */
export function townFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s && !/^india\.?$/i.test(s));
  let town = parts.pop();
  if (town && /\d{5,6}/.test(town))
    town = parts.pop() ?? town.replace(/[–-]?\s*\d{5,6}/, "").trim();
  return town && town.length <= 28 ? town : null;
}

/** A street address on one line: line breaks become ", " without doubling a comma that is already there. */
export function oneLineAddress(address: string | null | undefined): string {
  return (address ?? "")
    .replace(/,?\s*\n\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}
