import { getRouteApi } from "@tanstack/react-router";
import type { PublicSiteBundle } from "@/lib/public-site";

const rootApi = getRouteApi("__root__");

/**
 * What the server already read for this academy's website (content, fees, batches). Passed to `useQuery` as
 * `initialData` so an inner page is complete in the first paint, with no empty state that fills in later.
 */
export function useSiteBundle(): PublicSiteBundle | null {
  return (rootApi.useLoaderData() as { site?: PublicSiteBundle | null }).site ?? null;
}
