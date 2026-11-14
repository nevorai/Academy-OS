#!/usr/bin/env bash
# Puts Academy OS's settings on the Cloudflare Worker nevorai-academy-os without printing any value.
#   bash scripts/cf-copy-secrets.sh          (from ~/academyos)
# Vercel never gives secrets back, so they come from the Nevorai vault, the saved cron secret, and
# (public values) Vercel or .env. R2_PRIVATE_* = the one universal R2 key (same vault values as R2_*).
# Two are in none of those (VAPID_PRIVATE_KEY, KAIZEN_PROVISION_SECRET): you are asked for each (hidden; Enter skips).
set -uo pipefail
cd "$(dirname "$0")/.."
VAULT="$HOME/nevorai-kaizen/scripts/vault.sh"; WORKER=nevorai-academy-os
npx vercel env pull /tmp/acad.env --environment production --yes >/dev/null 2>&1 || true
put() { printf %s "$2" | npx wrangler@4.84.1 secret put "$1" --name "$WORKER" >/dev/null 2>&1 && echo "  set    $1" || echo "  FAILED $1"; }
vault() { bash "$VAULT" get "$1" 2>/dev/null || true; }
pub() { { grep "^$1=" /tmp/acad.env 2>/dev/null; grep "^$1=" .env 2>/dev/null; } | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
for k in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY VAPID_PUBLIC_KEY VAPID_SUBJECT; do v="$(pub $k)"; [ -n "$v" ] && put $k "$v" || echo "  MISSING $k"; done
put PLATFORM_BASE_DOMAIN nevorai.com
put R2_ACCOUNT_ID b2cc3a6e16425fd28d16161e9acaa822
for pair in SUPABASE_SERVICE_ROLE_KEY:NEVORAI_OS_SERVICE_ROLE_KEY RESEND_API_KEY:RESEND_API_KEY R2_ACCESS_KEY_ID:R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY:R2_SECRET_ACCESS_KEY R2_PRIVATE_ACCESS_KEY_ID:R2_ACCESS_KEY_ID R2_PRIVATE_SECRET_ACCESS_KEY:R2_SECRET_ACCESS_KEY; do
  v="$(vault ${pair#*:})"; [ -n "$v" ] && put ${pair%%:*} "$v" || echo "  MISSING ${pair%%:*}"; done
v="$(cat "$HOME/academy-move-private/cron_secret.txt" 2>/dev/null | tr -d '\n')"; [ -n "$v" ] && put CRON_SECRET "$v" || echo "  MISSING CRON_SECRET"
for k in VAPID_PRIVATE_KEY KAIZEN_PROVISION_SECRET; do
  [ -t 0 ] || { echo "  SKIPPED $k (needs your terminal)"; continue; }
  read -rsp "Paste $k (Enter to skip): " v; echo; [ -n "$v" ] && put $k "$v" || echo "  skipped $k"; done
rm -f /tmp/acad.env
