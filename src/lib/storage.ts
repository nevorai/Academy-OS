import { STORAGE_BUCKET } from "@/lib/db-schema";
import { supabase } from "@/integrations/supabase/client";
import { createMediaUpload, signPrivateMedia } from "@/lib/media.functions";
import { cleanExt, mediaR2On, parseMediaPath, publicMediaUrl } from "@/lib/media-paths";

const BUCKET = STORAGE_BUCKET;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** The extension from the file name; camera shots with no name fall back to the type. */
function extOf(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : undefined;
  return fromName || EXT_BY_TYPE[file.type] || "bin";
}

/**
 * Website pictures are served by the CDN, which does not show SVG. With R2 on, a logo
 * in SVG is drawn once into a PNG (see-through background kept) before it goes up.
 */
async function maybeRasterizeSvg(file: File): Promise<File> {
  if (typeof document === "undefined" || file.type !== "image/svg+xml") return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("svg"));
      el.src = url;
    });
    const w = img.naturalWidth || 512;
    const h = img.naturalHeight || 512;
    const scale = 1024 / Math.max(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.png`, { type: "image/png" }) : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const COMPRESS_MAX_DIM = 1600;
const COMPRESS_MIN_BYTES = 300 * 1024;

/**
 * Downscale + re-encode large photos as WebP (preserves logo transparency) before upload.
 * Coaches upload 5–10 MB phone photos; the site only ever needs ~200 KB.
 * Falls back to the original file for SVG/GIF, small files, or any codec failure.
 */
async function maybeCompressImage(
  file: File,
): Promise<{ blob: Blob; ext: string; contentType: string }> {
  const original = {
    blob: file as Blob,
    ext: extOf(file),
    contentType: file.type || "application/octet-stream",
  };
  const skip =
    typeof document === "undefined" ||
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    file.type === "image/gif" ||
    file.size < COMPRESS_MIN_BYTES;
  if (skip) return original;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, COMPRESS_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    if (blob && blob.size > 0 && blob.size < file.size) {
      return { blob, ext: "webp", contentType: "image/webp" };
    }
  } catch {
    // fall through to original
  }
  return original;
}

// NOTE: any NEW public-website section must upload under the 'public/' prefix
// (e.g. folder = "public/testimonials"). The tenant-assets storage RLS anon-read
// allowlist only permits: public, gallery, hero, logo_url, founder, cta,
// star_players, upi_qr_url. A new root folder outside this list is anon-invisible.
export async function uploadTenantFile(
  tenantId: string,
  folder: string,
  file: File,
): Promise<string> {
  const r2 = mediaR2On();
  const { blob, ext, contentType } = await maybeCompressImage(r2 ? await maybeRasterizeSvg(file) : file);

  // Safari/WebKit can send Blob uploads through supabase-js as an empty
  // multipart body (`content-length: 0`), which Supabase rejects as
  // "No content provided". Upload a raw ArrayBuffer instead so every browser
  // sends the actual bytes with the correct content type.
  const body = await blob.arrayBuffer();
  if (body.byteLength === 0) throw new Error("Selected file is empty");

  if (r2) {
    // Cloudflare R2: the server checks who is asking and picks the name, the browser PUTs the file
    // straight to a signed link. The path stored in the database keeps its old shape.
    const slot = await createMediaUpload({
      data: { tenantId, folder, ext: cleanExt(ext) ?? ext, size: body.byteLength },
    });
    if (!slot.ok) throw new Error(slot.error);
    if (slot.mode === "r2") {
      const res = await fetch(slot.putUrl, {
        method: "PUT",
        headers: { "content-type": slot.type },
        body,
      }).catch(() => null);
      if (!res || !res.ok) throw new Error("Upload failed. Check your internet and try again.");
      return slot.path;
    }
  }

  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });
  if (error) throw error;
  return path;
}

const privateLinks = new Map<string, { url: string; at: number }>();
const privateInflight = new Map<string, Promise<string>>();

/** A private file (registration documents, payment proofs): a server-made link, kept for 50 minutes. */
function privateLink(path: string): Promise<string> {
  const hit = privateLinks.get(path);
  if (hit && Date.now() - hit.at < 50 * 60_000) return Promise.resolve(hit.url);
  let pending = privateInflight.get(path);
  if (!pending) {
    pending = signPrivateMedia({ data: { path } })
      .then((r) => {
        const url = r.url ?? "";
        if (url) privateLinks.set(path, { url, at: Date.now() });
        return url;
      })
      .catch(() => "")
      .finally(() => privateInflight.delete(path));
    privateInflight.set(path, pending);
  }
  return pending;
}

export async function signedUrl(path: string, expiresIn = 60 * 60 * 24 * 365): Promise<string> {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/")) return path; // absolute app-relative asset (e.g. Lovable CDN)
  if (mediaR2On()) {
    const parsed = parseMediaPath(path);
    if (parsed?.isPublic) {
      // Public pictures: the CDN address follows from the path, no request at all.
      const url = publicMediaUrl(path);
      if (url) return url;
    } else if (parsed) {
      return privateLink(path);
    }
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return "";
  return data.signedUrl;
}

export async function deleteTenantFile(path: string) {
  if (!path || path.startsWith("http")) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export const TENANT_BUCKET = BUCKET;
