import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Shown in the work area while a tab's code or data loads, so a click always gets an answer. */
function PagePending() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-40 animate-pulse rounded-md bg-black/10" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-black/5" />
      <div className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-black/5" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-black/5" />
    </div>
  );
}

/**
 * A tab opened before a new version went live asks for page code that no longer exists, and the
 * click does nothing. Reload once to pick up the new version (at most once every 15 s, so a real
 * outage cannot loop).
 */
function installStaleCodeRecovery() {
  const w = window as unknown as { __staleRecovery?: boolean };
  if (w.__staleRecovery) return;
  w.__staleRecovery = true;
  const KEY = "acad.stale-reload";
  const reloadOnce = () => {
    try {
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 15000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* storage blocked: reload anyway, the page is unusable otherwise */
    }
    window.location.reload();
  };
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    reloadOnce();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String((e.reason && (e.reason.message || e.reason)) || "");
    if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg)) {
      e.preventDefault();
      reloadOnce();
    }
  });
}

export const getRouter = () => {
  // Global cache defaults: reuse fetched data between navigations so
  // revisiting a page feels instant, and avoid refetch storms on tab focus.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Data stays fresh for 60s — no refetch on remount/nav within that window.
        staleTime: 60 * 1000,
        // Keep unused data in memory for 10 min so back-navigation is instant.
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Query owns freshness; router preload is a no-op cache.
    defaultPreloadStaleTime: 0,
    // Prefetch route code (and any loader data) on link hover / focus.
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    // Skeleton after 100 ms (never flashes on fast loads), kept at least 250 ms once shown.
    defaultPendingMs: 100,
    defaultPendingMinMs: 250,
    defaultPendingComponent: PagePending,
  });

  if (typeof window !== "undefined") installStaleCodeRecovery();

  return router;
};
