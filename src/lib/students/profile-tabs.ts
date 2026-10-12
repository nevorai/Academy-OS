export const PLAYER_TABS = [
  "overview",
  "timeline",
  "performance",
  "attendance",
  "matches",
  "more",
] as const;
export type PlayerTab = (typeof PLAYER_TABS)[number];

/** Reads the `?tab=` value from the address; anything unknown means "no choice made". */
export function parsePlayerTab(value: unknown): PlayerTab | undefined {
  return typeof value === "string" && (PLAYER_TABS as readonly string[]).includes(value)
    ? (value as PlayerTab)
    : undefined;
}
