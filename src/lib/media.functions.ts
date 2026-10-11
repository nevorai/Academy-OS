/**
 * Academy OS file store on Cloudflare R2: upload slots, private-file links, and cleanup.
 * Rules live in media-paths.ts; the switch is VITE_MEDIA_R2=1 plus the R2 keys. While the
 * switch is off every function answers "use Supabase" and nothing changes.
 *
 * Who may do what mirrors the old storage rules exactly:
 *   write  - platform admin or a member of that academy (any folder); a registered player
 *            (folders players, registration); anyone (folder registration) while the
 *            academy is active, rate limited
 *   read   - public folders: everyone, from the CDN. Anything else: platform admin or a
 *            member of that academy, through a signed link that lasts one hour
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DB_SCHEMA, STORAGE_BUCKET } from "@/lib/db-schema";
import {
  UPLOAD_TYPES,
  cleanExt,
  mediaR2On,
  parseMediaPath,
  privateKey,
  publicKey,
} from "@/lib/media-paths";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOLDER = /^[A-Za-z0-9_-]{1,40}(\/[A-Za-z0-9_-]{1,40}){0,2}$/;

export type UploadSlot =
  | { ok: true; mode: "supabase" }
  | { ok: true; mode: "r2"; path: string; putUrl: string; type: string }
  | { ok: false; error: string };

/** The signed-in person behind this request, or null for a visitor. Never throws. */
async function callerOrNull() {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { createClient } = await import("@supabase/supabase-js");
    const auth = getRequest()?.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!token || token.split(".").length !== 3 || !url || !key) return null;
    const supabase = createClient(url, key, {
      db: { schema: DB_SCHEMA },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          // New-style opaque API keys are not bearer tokens: send them only as `apikey`.
          if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    return error || !userId ? null : { supabase, userId };
  } catch {
    return null;
  }
}

async function platformAdminOrMember(
  caller: NonNullable<Awaited<ReturnType<typeof callerOrNull>>>,
  tenantId: string,
): Promise<boolean> {
  const [admin, member] = await Promise.all([
    caller.supabase.rpc("is_platform_admin", { _uid: caller.userId }),
    caller.supabase.rpc("is_tenant_member", { _tenant: tenantId, _uid: caller.userId }),
  ]);
  return admin.data === true || member.data === true;
}

/**
 * Hands the browser a one-time slot to upload into. The server picks the file name and checks
 * who is asking; the browser then PUTs the file straight to R2 (it never passes through here).
 * `mode: "supabase"` means "R2 is not switched on, upload the old way".
 */
export const createMediaUpload = createServerFn({ method: "POST" })
  .inputValidator((v: { tenantId: string; folder: string; ext: string; size: number }) => v)
  .handler(async ({ data }): Promise<UploadSlot> => {
    if (!mediaR2On()) return { ok: true, mode: "supabase" };
    const { r2Configured, r2SignedPut } = await import("@/lib/r2.server");

    const ext = cleanExt(String(data.ext ?? ""));
    const rule = ext ? UPLOAD_TYPES[ext] : undefined;
    const size = Number(data.size);
    if (!UUID.test(String(data.tenantId)) || !FOLDER.test(String(data.folder)) || !Number.isFinite(size) || size <= 0) {
      return { ok: false, error: "That upload isn't allowed." };
    }
    if (!ext || !rule) return { ok: false, error: "This file type can't be uploaded. Use a JPG, PNG, WebP or PDF." };
    if (size > rule.maxBytes) {
      return { ok: false, error: `This file is too large (limit ${Math.round(rule.maxBytes / 1048576)} MB).` };
    }

    const tenantId = data.tenantId.toLowerCase();
    const folders = data.folder.split("/");
    const root = folders[0];
    const path = `${tenantId}/${folders.join("/")}/${crypto.randomUUID()}.${ext}`;
    const parsed = parseMediaPath(path);
    if (!parsed) return { ok: false, error: "That upload isn't allowed." };
    if (parsed.isPublic && !rule.publicOk) {
      return { ok: false, error: "This picture type can't be shown on the website. Use a JPG, PNG or WebP." };
    }

    // Who is asking?
    const caller = await callerOrNull();
    let allowed = false;
    if (caller) {
      allowed = await platformAdminOrMember(caller, tenantId);
      if (!allowed && (root === "players" || root === "registration")) {
        const { data: row } = await caller.supabase
          .from("students")
          .select("id")
          .eq("user_id", caller.userId)
          .eq("tenant_id", tenantId)
          .limit(1)
          .maybeSingle();
        allowed = !!row;
      }
    }
    if (!allowed && root === "registration") {
      // The public registration form: anyone, but only into an active academy and not in bulk.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { getRequest } = await import("@tanstack/react-start/server");
      const ip = (getRequest()?.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
      const [active, within] = await Promise.all([
        supabaseAdmin.rpc("is_active_tenant", { _tenant_id: tenantId }),
        supabaseAdmin.rpc("check_rate_limit", { _key: `upload:ip:${ip}`, _max_hits: 40, _window_seconds: 600 }),
      ]);
      if (within.data === false) return { ok: false, error: "Too many uploads. Please wait a few minutes and try again." };
      allowed = active.data === true;
    }
    if (!allowed) return { ok: false, error: "You don't have permission to upload here." };

    const which = parsed.isPublic ? "public" : "private";
    if (!r2Configured(which)) return { ok: false, error: "File uploads aren't set up yet. Please tell support." };
    const key = parsed.isPublic ? publicKey(parsed) : privateKey(parsed);
    const putUrl = key ? await r2SignedPut(which, key, rule.type, size) : null;
    if (!putUrl) return { ok: false, error: "That upload isn't allowed." };
    return { ok: true, mode: "r2", path, putUrl, type: rule.type };
  });

/**
 * A link that opens one PRIVATE file (registration documents, Aadhaar scans, payment proofs)
 * for an hour. Signed-in people only. Platform admins and members of the academy get the R2
 * copy; anyone else, or a file not yet copied, goes the old way where Supabase's own storage
 * rules decide, so nobody gains access they did not have.
 */
export const signPrivateMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { path: string }) => v)
  .handler(async ({ data, context }): Promise<{ url: string | null }> => {
    const path = String(data.path ?? "");
    const parsed = parseMediaPath(path);
    if (mediaR2On() && parsed && !parsed.isPublic) {
      const { r2Configured, r2Exists, r2PrivateSignedGet } = await import("@/lib/r2.server");
      if (r2Configured("private")) {
        const caller = { supabase: context.supabase, userId: context.userId };
        if (await platformAdminOrMember(caller, parsed.tenant)) {
          const key = privateKey(parsed);
          if (await r2Exists("private", key)) return { url: await r2PrivateSignedGet(key, 3600) };
        }
      }
    }
    const { data: signed, error } = await context.supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
    return { url: error ? null : (signed?.signedUrl ?? null) };
  });

/** For the manual-payment screenshot link (called from manual.functions.ts after its own checks). */
export async function privateLinkFor(path: string): Promise<string | null> {
  const parsed = parseMediaPath(path);
  if (!mediaR2On() || !parsed || parsed.isPublic) return null;
  const { r2Configured, r2Exists, r2PrivateSignedGet } = await import("@/lib/r2.server");
  if (!r2Configured("private")) return null;
  const key = privateKey(parsed);
  return (await r2Exists("private", key)) ? r2PrivateSignedGet(key, 1800) : null;
}

/** Platform admin only: after a tenant is deleted, clear its files from R2 (private documents included). */
export const removeTenantMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { tenantId: string }) => v)
  .handler(async ({ data, context }): Promise<{ removed: number; failed: boolean }> => {
    if (!UUID.test(String(data.tenantId))) return { removed: 0, failed: true };
    const { data: isAdmin } = await context.supabase.rpc("is_platform_admin", { _uid: context.userId });
    if (isAdmin !== true) throw new Error("Only a platform admin can do this.");
    const { r2RemovePrefix } = await import("@/lib/r2.server");
    const prefix = `academy/${data.tenantId.toLowerCase()}/`;
    const [pub, priv] = await Promise.all([r2RemovePrefix("public", prefix), r2RemovePrefix("private", prefix)]);
    return { removed: pub.removed + priv.removed, failed: pub.failed || priv.failed };
  });
