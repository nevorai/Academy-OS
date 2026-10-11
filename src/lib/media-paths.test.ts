import { afterEach, describe, expect, it } from "vitest";
import {
  PUBLIC_FOLDERS,
  UPLOAD_TYPES,
  cleanExt,
  parseMediaPath,
  privateKey,
  publicKey,
  publicMediaUrl,
} from "./media-paths";
import { r2SignedPut, r2Configured } from "./r2.server";

const T = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
// The CDN Worker (~/nevorai-media/src/index.js) only serves <product>/<tenant>/<file>.
const WORKER_DIRECT = /^\/([a-z0-9-]{1,32})\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9._-]{1,120})$/;

describe("parseMediaPath", () => {
  it("reads <tenant>/<folder>/<file> and nested folders", () => {
    expect(parseMediaPath(`${T}/gallery/a1.webp`)).toEqual({ tenant: T, folders: ["gallery"], name: "a1.webp", isPublic: true });
    expect(parseMediaPath(`${T}/hero/home/a1.webp`)?.folders).toEqual(["hero", "home"]);
  });

  it("refuses anything that is not that shape", () => {
    for (const bad of [
      "gallery/a1.webp",
      `${T}/a1.webp`,
      `not-a-uuid/gallery/a1.webp`,
      `${T}/../gallery/a1.webp`,
      `${T}/gallery/a b.webp`,
      `${T}/a/b/c/d/e.webp`,
      `${T}/gal lery/a1.webp`,
      "",
    ]) {
      expect(parseMediaPath(bad), bad).toBeNull();
    }
  });
});

describe("public vs private", () => {
  it("serves the old anon-readable folders from the CDN and nothing else", () => {
    for (const f of ["public", "gallery", "hero", "logo_url", "founder", "cta", "star_players", "upi_qr_url", "players"]) {
      expect(PUBLIC_FOLDERS.has(f), f).toBe(true);
    }
    for (const f of ["registration", "aadhaar", "students", "payments"]) {
      expect(PUBLIC_FOLDERS.has(f), f).toBe(false);
    }
  });

  it("folds the folder into the file name so the CDN route matches", () => {
    const p = parseMediaPath(`${T}/hero/home/a1.webp`)!;
    expect(publicKey(p)).toBe(`academy/${T}/hero--home--a1.webp`);
    expect(`/${publicKey(p)}`).toMatch(WORKER_DIRECT);
    const q = parseMediaPath(`${T}/logo_url/9f8e.png`)!;
    expect(`/${publicKey(q)}`).toMatch(WORKER_DIRECT);
  });

  it("never gives a private file a public address", () => {
    for (const path of [`${T}/registration/a.jpg`, `${T}/aadhaar/a.jpg`, `${T}/payments/proofs/a.png`, `${T}/students/a.webp`]) {
      const p = parseMediaPath(path)!;
      expect(p.isPublic, path).toBe(false);
      expect(publicKey(p), path).toBeNull();
      expect(publicMediaUrl(path), path).toBeNull();
      expect(privateKey(p)).toBe(`academy/${path}`);
    }
  });

  it("builds the CDN address from the path alone", () => {
    expect(publicMediaUrl(`${T}/gallery/a1.webp`)).toBe(`https://media.nevorai.com/academy/${T}/gallery--a1.webp`);
    expect(publicMediaUrl("http://x/y.png")).toBeNull();
  });
});

describe("upload rules", () => {
  it("fixes the type from the extension", () => {
    expect(cleanExt("Photo.JPG")).toBe("jpg");
    expect(cleanExt("webp")).toBe("webp");
    expect(cleanExt("bad ext!")).toBeNull();
    expect(UPLOAD_TYPES.pdf.type).toBe("application/pdf");
  });

  it("keeps iPhone HEIC private-only (the CDN cannot show it)", () => {
    expect(UPLOAD_TYPES.heic.publicOk).toBe(false);
    expect(UPLOAD_TYPES.jpg.publicOk).toBe(true);
    expect(UPLOAD_TYPES.svg).toBeUndefined();
    expect(UPLOAD_TYPES.html).toBeUndefined();
  });
});

describe("r2.server signing", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is off without keys", async () => {
    delete process.env.R2_ACCOUNT_ID;
    expect(r2Configured("public")).toBe(false);
  });

  it("signs a 10-minute PUT into the right bucket for each kind", async () => {
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "pub-id";
    process.env.R2_SECRET_ACCESS_KEY = "pub-secret";
    process.env.R2_PRIVATE_ACCESS_KEY_ID = "priv-id";
    process.env.R2_PRIVATE_SECRET_ACCESS_KEY = "priv-secret";
    const pub = (await r2SignedPut("public", `academy/${T}/gallery--a1.webp`, "image/webp", 1234))!;
    const priv = (await r2SignedPut("private", `academy/${T}/registration/a1.jpg`, "image/jpeg", 1234))!;
    expect(pub).toContain("/nevorai-media/academy/");
    expect(priv).toContain("/nevorai-private/academy/");
    for (const u of [pub, priv]) {
      expect(u).toContain("X-Amz-Expires=600");
      expect(u).toContain("X-Amz-Signature=");
    }
    expect(pub).toContain("X-Amz-Credential=pub-id");
    expect(priv).toContain("X-Amz-Credential=priv-id");
  });
});
