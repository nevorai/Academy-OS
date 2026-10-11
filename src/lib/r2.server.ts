import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 for Academy OS (skill `media-r2`). Server only: the keys never reach the browser.
 *
 * Env on Vercel (project academyos), set once by Adarsh:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY                  token for bucket nevorai-media (public pictures)
 *   R2_PRIVATE_ACCESS_KEY_ID, R2_PRIVATE_SECRET_ACCESS_KEY  token for bucket nevorai-private only
 *   VITE_MEDIA_R2=1                                         the switch (see media-paths.ts)
 * The two tokens are separate so the one that serves public pictures can never read private documents.
 */

type Which = "public" | "private";

const clients: Partial<Record<Which, AwsClient>> = {};

function aws(which: Which): AwsClient | null {
  const have = clients[which];
  if (have) return have;
  const e = process.env;
  const id = which === "public" ? e.R2_ACCESS_KEY_ID : e.R2_PRIVATE_ACCESS_KEY_ID;
  const secret = which === "public" ? e.R2_SECRET_ACCESS_KEY : e.R2_PRIVATE_SECRET_ACCESS_KEY;
  if (!e.R2_ACCOUNT_ID || !id || !secret) return null;
  return (clients[which] = new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: "s3", region: "auto" }));
}

export const r2Configured = (which: Which) => aws(which) !== null;

const bucket = (which: Which) =>
  which === "public"
    ? process.env.R2_BUCKET || "nevorai-media"
    : process.env.R2_PRIVATE_BUCKET || "nevorai-private";

const base = (which: Which) => `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket(which)}`;

const objectUrl = (which: Which, key: string) =>
  `${base(which)}/${key.split("/").map(encodeURIComponent).join("/")}`;

/**
 * A link the browser PUTs one new file to (10 minutes). The Content-Type and the exact
 * byte length are part of the signature, so the link cannot be used for a bigger file than
 * the one the server approved (the public registration form is open to anyone).
 */
export async function r2SignedPut(
  which: Which,
  key: string,
  contentType: string,
  size: number,
): Promise<string | null> {
  const c = aws(which);
  if (!c || !Number.isInteger(size) || size <= 0) return null;
  const url = new URL(objectUrl(which, key));
  url.searchParams.set("X-Amz-Expires", "600");
  const signed = await c.sign(url.toString(), {
    method: "PUT",
    headers: { "content-type": contentType, "content-length": String(size) },
    // aws4fetch leaves content-type and content-length out of the signature unless asked.
    aws: { signQuery: true, allHeaders: true },
  });
  return signed.url;
}

/** A link that opens one private file for `seconds` (60 s to 24 h). */
export async function r2PrivateSignedGet(key: string, seconds = 3600): Promise<string | null> {
  const c = aws("private");
  if (!c) return null;
  const url = new URL(objectUrl("private", key));
  url.searchParams.set("X-Amz-Expires", String(Math.min(Math.max(60, seconds), 86400)));
  const signed = await c.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

/** Copies a file in from the server (used by the migration script). */
export async function r2Put(which: Which, key: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
  const c = aws(which);
  if (!c) return false;
  const res = await c.fetch(objectUrl(which, key), {
    method: "PUT",
    headers: { "content-type": contentType || "application/octet-stream" },
    body: bytes as unknown as BodyInit,
  });
  return res.ok;
}

export async function r2Exists(which: Which, key: string): Promise<boolean> {
  const c = aws(which);
  if (!c) return false;
  const res = await c.fetch(objectUrl(which, key), { method: "HEAD" }).catch(() => null);
  return !!res && res.ok;
}

/**
 * Removes every file under a prefix (a deleted academy's folder). `failed` is true
 * if the listing or a delete could not finish, so the caller can say so.
 */
export async function r2RemovePrefix(which: Which, prefix: string): Promise<{ removed: number; failed: boolean }> {
  const c = aws(which);
  if (!c) return { removed: 0, failed: false };
  let removed = 0;
  for (let round = 0; round < 50; round++) {
    const list = await c
      .fetch(`${base(which)}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=500`)
      .catch(() => null);
    if (!list || !list.ok) return { removed, failed: true };
    const xml = await list.text();
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) =>
      m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
    );
    if (!keys.length) return { removed, failed: false };
    for (let i = 0; i < keys.length; i += 8) {
      const results = await Promise.all(
        keys.slice(i, i + 8).map((k) => c.fetch(objectUrl(which, k), { method: "DELETE" }).catch(() => null)),
      );
      for (const r of results) {
        if (r && (r.ok || r.status === 404)) removed++;
        else return { removed, failed: true };
      }
    }
  }
  return { removed, failed: true };
}
