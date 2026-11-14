#!/usr/bin/env bash
# Build Nevorai Academy and deploy it to the Cloudflare Worker nevorai-academy-os, keeping EVERY academy address attached.
#
#   cd ~/academyos && bash scripts/cf-deploy.sh
#
# Why a script: `wrangler deploy` REPLACES the Worker's custom-domain list with the routes of the build. Tenant addresses
# ({slug}.nevorai.com and nevorai.com custom domains saved in academy.tenants) are read from the database and added here,
# exact names only, never a wildcard. If the list cannot be read it STOPS and deploys nothing.
# Secrets are Worker secrets (scripts/cf-copy-secrets.sh); nothing secret is printed. Run wrangler outside any sandbox.
# Crons: Supabase pg_cron (academy-* jobs) calls https://academyos.nevorai.com/api/public/hooks/* with x-cron-secret = CRON_SECRET.
set -euo pipefail
cd "$(dirname "$0")/.."
die() { echo >&2; echo "STOPPED: $*" >&2; exit 1; }
VAULT="$HOME/nevorai-kaizen/scripts/vault.sh"

echo "1/3 building ..."
# Build-time switches (Vite bakes VITE_* in). Same values the Vercel production build had.
export VITE_MEDIA_R2=1 VITE_PLATFORM_BASE_DOMAIN=nevorai.com VITE_DB_SCHEMA=academy VITE_STORAGE_BUCKET=academy-assets
bun run build >/dev/null || die "the build failed (run: bun run build). Nothing was deployed."
[ -s .output/server/wrangler.json ] || die "no build output. Nothing was deployed."

echo "2/3 reading the academy addresses from the database ..."
SRK="$(bash "$VAULT" get NEVORAI_OS_SERVICE_ROLE_KEY 2>/dev/null || true)"
[ -n "$SRK" ] || die "no NEVORAI_OS_SERVICE_ROLE_KEY in the vault. Nothing was deployed."
SRK="$SRK" node --input-type=module -e '
import fs from "node:fs";
const key = process.env.SRK, url = "https://wxgfaaaboftzsazknbvl.supabase.co";
const stop = (m) => { console.error("STOPPED: " + m + " Nothing was deployed."); process.exit(1); };
const res = await fetch(`${url}/rest/v1/tenants?select=slug,custom_domain,status`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "academy" } }).catch(() => null);
if (!res || !res.ok) stop("could not read academy.tenants (" + (res ? res.status : "no connection") + ").");
const rows = await res.json();
if (!Array.isArray(rows)) stop("the tenant list came back in an unexpected shape.");
const reserved = new Set(["academy", "academyos", "www", "app", "api", "admin", "flow", "auth", "billing", "dash", "dashboard", "media", "sites"]);
const ok = /^[a-z0-9][a-z0-9-]{1,39}\.nevorai\.com$/;
const hosts = new Set(["academy.nevorai.com", "academyos.nevorai.com"]);
const own = [];
for (const t of rows) {
  if (t.slug && !reserved.has(t.slug)) { const h = `${t.slug}.nevorai.com`.toLowerCase(); if (ok.test(h)) hosts.add(h); }
  const d = (t.custom_domain || "").toLowerCase().trim();
  if (d) { if (ok.test(d) && !reserved.has(d.split(".")[0])) hosts.add(d); else if (!d.endsWith(".nevorai.com")) own.push(d); }
}
const file = ".output/server/wrangler.json";
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
cfg.name = "nevorai-academy-os";
// Nitro stamps the LOCAL date (India is ahead of UTC); Cloudflare rejects a date later than UTC today.
const utc = new Date().toISOString().slice(0, 10);
if (cfg.compatibility_date > utc) cfg.compatibility_date = utc;
cfg.routes = [...hosts].sort().map((h) => ({ pattern: h, custom_domain: true }));
if (cfg.routes.some((r) => r.pattern.includes("*"))) stop("a wildcard route is in the list.");
delete cfg.placement; // no placement hint, so the edge cache in src/server.ts answers from the visitor data centre
cfg.observability = { enabled: true };
cfg.workers_dev = true;
fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
console.log("   addresses that will stay attached:"); for (const r of cfg.routes) console.log("     - " + r.pattern);
if (own.length) console.log("   own domains (attach by hand as Cloudflare custom hostnames): " + own.join(", "));
' || die "reading the academy addresses failed. Nothing was deployed."

echo "3/3 deploying (answer NO if wrangler ever asks to replace an existing DNS record) ..."
npx wrangler@4.84.1 deploy -c .output/server/wrangler.json || {
  echo "deploy step failed; retrying only the domain/trigger step ..."; npx wrangler@4.84.1 triggers deploy -c .output/server/wrangler.json; }
