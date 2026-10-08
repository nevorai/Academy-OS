/**
 * Where an Academy OS file lives, decided from its stored path alone (skill `media-r2`).
 *
 * The database keeps the same path it always did: `<tenant uuid>/<folder>[/<sub>]/<file>`.
 * Nothing in the database is rewritten when files move to Cloudflare R2.
 *
 * - PUBLIC folders (the ones the old storage rules let signed-out visitors read:
 *   website pictures, logos, gallery, player photos, the UPI QR) are served by the
 *   CDN at media.nevorai.com. The URL is worked out from the path with no request.
 * - EVERY OTHER folder (student registration documents, Aadhaar scans, payment proofs,
 *   student photos) is PRIVATE: bucket `nevorai-private`, opened only through a
 *   short signed link the server makes after checking who is asking.
 *
 * One switch, `VITE_MEDIA_R2=1` (set on Vercel together with the R2 keys, after
 * scripts/migrate-media-to-r2.ts has copied the old files), moves reading and
 * writing at once. Unset it and everything goes back to Supabase Storage.
 */

/** Same list the old storage rule `anon read public sections` allowed (plus `logo`, a brand logo made when a tenant is created). */
export const PUBLIC_FOLDERS: ReadonlySet<string> = new Set([
  "public",
  "gallery",
  "hero",
  "logo_url",
  "logo",
  "founder",
  "cta",
  "star_players",
  "upi_qr_url",
  "players",
]);

/** Read in both the browser and the server (Vite bakes it in at build time). */
export function mediaR2On(): boolean {
  return (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_MEDIA_R2 === "1";
}

export function mediaBase(): string {
  const set = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_MEDIA_BASE;
  return (set || "https://media.nevorai.com").replace(/\/$/, "");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOLDER_SEG = /^[A-Za-z0-9_-]{1,40}$/;
const FILE_NAME = /^[A-Za-z0-9._-]{1,100}$/;

export type MediaPath = { tenant: string; folders: string[]; name: string; isPublic: boolean };

/** Reads `<tenant>/<folder>[/<sub>[/<sub>]]/<file>`; null for anything that is not that shape. */
export function parseMediaPath(path: string): MediaPath | null {
  if (typeof path !== "string" || path.includes("..")) return null;
  const parts = path.split("/");
  if (parts.length < 3 || parts.length > 5) return null;
  const [tenant, ...rest] = parts;
  const name = rest.pop() as string;
  if (!UUID.test(tenant) || !FILE_NAME.test(name) || !rest.every((s) => FOLDER_SEG.test(s))) return null;
  return { tenant: tenant.toLowerCase(), folders: rest, name, isPublic: PUBLIC_FOLDERS.has(rest[0]) };
}

/**
 * The public bucket key. The CDN serves exactly `<product>/<tenant>/<file>`, so the
 * folder is folded into the file name: `academy/<tenant>/<folder>--<sub>--<file>`.
 */
export function publicKey(p: MediaPath): string | null {
  const file = [...p.folders, p.name].join("--");
  return p.isPublic && file.length <= 120 ? `academy/${p.tenant}/${file}` : null;
}

/** The private bucket key (the path as stored, under `academy/`). */
export function privateKey(p: MediaPath): string {
  return `academy/${p.tenant}/${[...p.folders, p.name].join("/")}`;
}

/** The CDN address of a public file, or null if the path is not a public one. */
export function publicMediaUrl(path: string): string | null {
  const p = parseMediaPath(path);
  const key = p && publicKey(p);
  return key ? `${mediaBase()}/${key}` : null;
}

/**
 * What may be uploaded to R2: the type is fixed from the file extension (never taken
 * from the browser), and each kind has its own size cap.
 */
export const UPLOAD_TYPES: Record<string, { type: string; maxBytes: number; publicOk: boolean }> = {
  jpg: { type: "image/jpeg", maxBytes: 15 * 1048576, publicOk: true },
  jpeg: { type: "image/jpeg", maxBytes: 15 * 1048576, publicOk: true },
  png: { type: "image/png", maxBytes: 15 * 1048576, publicOk: true },
  webp: { type: "image/webp", maxBytes: 15 * 1048576, publicOk: true },
  gif: { type: "image/gif", maxBytes: 15 * 1048576, publicOk: true },
  avif: { type: "image/avif", maxBytes: 15 * 1048576, publicOk: true },
  heic: { type: "image/heic", maxBytes: 15 * 1048576, publicOk: false },
  heif: { type: "image/heif", maxBytes: 15 * 1048576, publicOk: false },
  pdf: { type: "application/pdf", maxBytes: 15 * 1048576, publicOk: true },
  mp4: { type: "video/mp4", maxBytes: 100 * 1048576, publicOk: true },
  webm: { type: "video/webm", maxBytes: 100 * 1048576, publicOk: true },
};

/** A tidy lower-case extension from a name or extension, or null. */
export function cleanExt(nameOrExt: string): string | null {
  const ext = (nameOrExt.includes(".") ? nameOrExt.split(".").pop() : nameOrExt)?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : null;
}
