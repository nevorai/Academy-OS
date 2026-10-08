/**
 * Copies every Academy OS file from the Supabase bucket (academy-assets) to Cloudflare R2:
 *   public folders (gallery, hero, logo_url, players ...) -> bucket nevorai-media  (media.nevorai.com)
 *   everything else (registration, aadhaar, payment proofs) -> bucket nevorai-private
 * Paths in the database do not change, so nothing in the database is touched, and the old
 * files stay where they are (delete them later, once the site has run on R2 for a while).
 *
 *   Dry run (reads only):   bun scripts/migrate-media-to-r2.ts
 *   Copy:                   bun scripts/migrate-media-to-r2.ts --apply
 *
 * Run it with prod's env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and for --apply
 * R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_PRIVATE_ACCESS_KEY_ID, R2_PRIVATE_SECRET_ACCESS_KEY.
 * Optional: VITE_STORAGE_BUCKET (default academy-assets).
 * Safe to run again: files already in R2 are skipped. Do this BEFORE setting
 * VITE_MEDIA_R2=1 on Vercel; when it ends with 0 failed, set the switch and redeploy.
 */
import { createClient } from "@supabase/supabase-js";
import { parseMediaPath, privateKey, publicKey } from "../src/lib/media-paths";
import { r2Configured, r2Exists, r2Put } from "../src/lib/r2.server";

const APPLY = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.VITE_STORAGE_BUCKET || "academy-assets";

type Entry = { name: string; isFile: boolean; size: number };

async function main() {
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  if (APPLY && (!r2Configured("public") || !r2Configured("private"))) {
    throw new Error(
      "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PRIVATE_ACCESS_KEY_ID and R2_PRIVATE_SECRET_ACCESS_KEY for --apply",
    );
  }
  const bucket = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET);
  console.log(`${APPLY ? "COPY" : "DRY RUN"} · ${new URL(url).hostname} · bucket ${BUCKET}`);

  const list = async (prefix: string): Promise<Entry[]> => {
    const out: Entry[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(prefix, { limit: 100, offset });
      if (error) throw error;
      if (!data?.length) break;
      for (const f of data) out.push({ name: f.name, isFile: !!f.id, size: Number(f.metadata?.size ?? 0) });
      if (data.length < 100) break;
    }
    return out;
  };
  const walk = async (prefix: string, out: Entry[] = []): Promise<Entry[]> => {
    for (const e of await list(prefix)) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isFile) out.push({ ...e, name: path });
      else await walk(path, out);
    }
    return out;
  };

  const files = await walk("");
  let bytes = 0, pub = 0, priv = 0, copied = 0, skipped = 0;
  const failed: string[] = [];
  const svg: string[] = [];
  for (const f of files) {
    bytes += f.size;
    const p = parseMediaPath(f.name);
    if (!p) { failed.push(`${f.name} (not a path Academy OS stores)`); continue; }
    const which = p.isPublic ? "public" : "private";
    const k = p.isPublic ? publicKey(p) : privateKey(p);
    if (!k) { failed.push(`${f.name} (name too long for the CDN)`); continue; }
    if (p.isPublic) pub++; else priv++;
    if (p.isPublic && /\.svg$/i.test(f.name)) svg.push(f.name);
    if (!APPLY) continue;
    try {
      if (await r2Exists(which, k)) { skipped++; continue; }
      const { data, error } = await bucket.download(f.name);
      if (error || !data) throw error ?? new Error("empty");
      if (!(await r2Put(which, k, new Uint8Array(await data.arrayBuffer()), data.type))) throw new Error("R2 write failed");
      copied++;
    } catch (e) {
      failed.push(`${f.name} (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  console.log(`${files.length} files, ${(bytes / 1048576).toFixed(1)} MB found (${pub} public, ${priv} private)`);
  if (APPLY) console.log(`${copied} copied, ${skipped} already there, ${failed.length} failed`);
  if (svg.length) console.log(`NOTE ${svg.length} public SVG file(s): the CDN serves SVG as a download, so these will not show as pictures:\n  ${svg.join("\n  ")}`);
  failed.forEach((f) => console.log("  FAILED " + f));
  if (failed.length) process.exitCode = 1;
  if (!APPLY) console.log("Nothing was changed. Run again with --apply.");
  else if (!failed.length) console.log("All copied. Now set VITE_MEDIA_R2=1 on Vercel and redeploy.");
}

main().catch((e) => { console.error(e); process.exit(1); });
