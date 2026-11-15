import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Edge cache (Cloudflare Workers): a page that says "Cache-Control: public, s-maxage=N" (for example the
// tenant home page) is kept in this data centre's cache for N seconds, keyed by the full URL (so per tenant
// host). A repeat visit is answered without rendering. Only anonymous GETs without a query string and only
// 200 answers without Set-Cookie are stored. Off outside Workers (no `caches.default`).
const ORIG_CC = "x-academy-orig-cc";
// Each deploy gets its own cache keys, so a page stored before a deploy never points at old app files.
const BUILD_ID: string = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BUILD_ID ?? "";

function edgeCache(): Cache | undefined {
  const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
  return c?.default;
}

function cacheable(request: Request): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.has("authorization")) return false;
  const url = new URL(request.url);
  if (url.search) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) return false;
  return true;
}

function sMaxAge(cc: string | null): number {
  if (!cc || !/\bpublic\b/i.test(cc) || /\b(private|no-store)\b/i.test(cc)) return 0;
  const m = /s-maxage=(\d+)/i.exec(cc);
  return m ? Math.min(Number(m[1]), 3600) : 0;
}

async function render(request: Request, env: unknown, ctx: unknown): Promise<Response> {
  const handler = await getServerEntry();
  const response = await handler.fetch(request, env, ctx);
  return normalizeCatastrophicSsrResponse(response);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const cache = edgeCache();
      if (cache && cacheable(request)) {
        const keyUrl = new URL(request.url);
        if (BUILD_ID) keyUrl.searchParams.set("__b", BUILD_ID);
        const key = new Request(keyUrl.toString(), { method: "GET" });
        const hit = await cache.match(key).catch(() => undefined);
        if (hit) {
          const out = new Response(hit.body, hit);
          const orig = out.headers.get(ORIG_CC);
          if (orig) out.headers.set("Cache-Control", orig);
          out.headers.delete(ORIG_CC);
          out.headers.set("x-edge-cache", "HIT");
          return out;
        }
        const response = await render(request, env, ctx);
        const ttl = sMaxAge(response.headers.get("Cache-Control"));
        if (response.status === 200 && ttl > 0 && !response.headers.has("set-cookie")) {
          const stored = new Response(response.clone().body, response);
          stored.headers.set(ORIG_CC, response.headers.get("Cache-Control") ?? "");
          stored.headers.set("Cache-Control", `public, max-age=${ttl}`);
          // Awaited on purpose: under Nitro the ctx here is not the Workers ExecutionContext, so a
          // fire-and-forget put can be cancelled. Costs a few ms on a miss only.
          await cache.put(key, stored).catch((e) => console.error("edge cache put failed", e));
          const out = new Response(response.body, response);
          out.headers.set("x-edge-cache", "MISS");
          return out;
        }
        return response;
      }
      return await render(request, env, ctx);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
