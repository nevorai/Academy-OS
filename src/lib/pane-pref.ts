/**
 * The width a person dragged a side panel to, and whether they folded it. Kept in localStorage (the dashboard only
 * draws after sign-in, on the client, so there is no first-paint jump). Holds nothing private.
 * Format: the width in pixels, plus "c" when folded: "288" or "288c".
 */
export type PanePref = { width: number; collapsed: boolean };

export function readPanePref(raw: string | null | undefined, def: number, min: number, max: number): PanePref {
  const m = /^(\d{2,4})(c?)$/.exec(raw ?? "");
  if (!m) return { width: def, collapsed: false };
  return { width: Math.min(max, Math.max(min, Number(m[1]))), collapsed: m[2] === "c" };
}

export const panePrefString = (p: PanePref) => `${Math.round(p.width)}${p.collapsed ? "c" : ""}`;

/** Browser only. Blocked storage just means the panel opens at its normal size next time. */
export function loadPanePref(key: string, def: number, min: number, max: number): PanePref {
  try {
    return readPanePref(localStorage.getItem(key), def, min, max);
  } catch {
    return { width: def, collapsed: false };
  }
}

export function savePanePref(key: string, p: PanePref) {
  try {
    localStorage.setItem(key, panePrefString(p));
  } catch {
    /* nothing to do */
  }
}

/** The dashboard sidebar: storage key and the sizes (pixels) it may take. */
export const SIDE_KEY = "academy-side";
export const SIDE_LIMITS = { def: 244, min: 196, max: 380, showAt: 140, folded: 72 } as const;
