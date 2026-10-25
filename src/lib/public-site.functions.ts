/**
 * One server trip for an academy's public pages: the academy itself, plus (for website pages)
 * its site content, active fee plans and batches. Called from the root route loader, so the
 * server-rendered HTML already holds the finished page and the browser makes no data request
 * before it can draw.
 *
 * Reads go through the publishable (anon) key, exactly like the browser did, so row-level
 * security decides what is public. Results are kept 30 s per academy in this process so a
 * crawler hitting uncached URLs cannot turn into a database hit per request.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DB_SCHEMA } from "@/lib/db-schema";
import {
  resolveTenantHint,
  type Batch,
  type FeePlan,
  type SiteContent,
  type Tenant,
} from "@/lib/tenant";
import { isPublicSitePath, isSafeHostToken, type PublicSiteBundle } from "@/lib/public-site";

const PUBLIC_COLS =
  "id, slug, name, short_name, tagline, custom_domain, logo_url, primary_color, secondary_color, niche, features, phone, whatsapp, email, address, status, fee_cycle, player_prefix, registration_pdf_url, page_hero_images, show_fees_tab, gender_pricing_enabled, admission_fee_enabled";

const input = z.object({
  hostname: z.string().min(1).max(253),
  pathname: z.string().max(300),
  search: z.string().max(300),
});

const TTL_MS = 30_000;
const MAX_ENTRIES = 200;
type DirectoryQuery = {
  eq(column: string, value: string): DirectoryQuery;
  or(filter: string): DirectoryQuery;
  limit(n: number): {
    maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
};

const cache = new Map<string, { at: number; value: PublicSiteBundle }>();

async function anonClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (i, init) => {
        const headers = new Headers(init?.headers);
        // New-style opaque API keys are not bearer tokens: send them only as `apikey`.
        if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(i, { ...init, headers });
      },
    },
  });
}

export const getPublicSite = createServerFn({ method: "GET" })
  .inputValidator((raw: z.input<typeof input>) => input.parse(raw))
  .handler(async ({ data }): Promise<PublicSiteBundle> => {
    const empty: PublicSiteBundle = {
      tenant: null,
      siteContent: null,
      feePlans: null,
      batches: null,
    };
    const hostname = data.hostname.toLowerCase();
    if (!isSafeHostToken(hostname)) return empty;

    const hint = resolveTenantHint({ hostname, pathname: data.pathname, search: data.search });
    if (!hint || !isSafeHostToken(hint.value)) return empty;

    const withContent = isPublicSitePath(data.pathname);
    const cacheKey = `${hint.mode}:${hint.value}:${hostname}:${withContent ? 1 : 0}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    const supabase = await anonClient();
    if (!supabase) return empty;

    // The directory view is not in the generated types, so describe the one query shape used here.
    const base = supabase
      .from("tenants_public_directory" as never)
      .select(PUBLIC_COLS) as unknown as DirectoryQuery;
    const tenantQuery =
      hint.mode === "domain"
        ? base.eq("custom_domain", hint.value)
        : base.or(`slug.eq.${hint.value},custom_domain.eq.${hostname}`);
    const { data: tenantRow, error } = await tenantQuery.limit(1).maybeSingle();
    if (error) {
      console.error("[public-site] tenant read failed", error.message);
      return empty;
    }
    const tenant = (tenantRow as unknown as Tenant | null) ?? null;
    if (!tenant) return cacheAndReturn(cacheKey, empty);
    if (!withContent || tenant.status !== "active") {
      return cacheAndReturn(cacheKey, { ...empty, tenant });
    }

    const [content, fees, batches] = await Promise.all([
      supabase
        .from("site_content")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("fee_plans")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .order("type", { ascending: true })
        .order("amount", { ascending: true }),
      supabase
        .from("batches")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .order("name", { ascending: true }),
    ]);
    // A failed read leaves that list null so the page falls back to asking from the browser.
    const bundle: PublicSiteBundle = {
      tenant,
      siteContent: content.error ? null : ((content.data ?? []) as SiteContent[]),
      feePlans: fees.error ? null : ((fees.data ?? []) as FeePlan[]),
      batches: batches.error ? null : ((batches.data ?? []) as Batch[]),
    };
    const failed = Boolean(content.error || fees.error || batches.error);
    return failed ? bundle : cacheAndReturn(cacheKey, bundle);
  });

function cacheAndReturn(key: string, value: PublicSiteBundle): PublicSiteBundle {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
  return value;
}
