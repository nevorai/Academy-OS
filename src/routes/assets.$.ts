import { createFileRoute } from "@tanstack/react-router";

/**
 * A build file under /assets/ that does not exist on this deployment.
 *
 * This happens right after a deploy: a browser still holds the previous page, or an edge node
 * still answers for the previous deployment, and asks for file names only the other build has.
 * The default 404 page went out with the one-year "immutable" cache header meant for real build
 * files, so browsers (and the CDN) kept the failure and the site stayed blank on every reload
 * until the cache was cleared (Safari, 2026-10-11). Answer plainly and let nothing keep it.
 */
const headers = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export const Route = createFileRoute("/assets/$")({
  server: {
    handlers: {
      GET: () => new Response("Not found", { status: 404, headers }),
      HEAD: () => new Response(null, { status: 404, headers }),
    },
  },
});
