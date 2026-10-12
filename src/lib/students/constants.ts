/**
 * Player constants and age helpers: the statuses, cricket options and age
 * groups every players screen shares. No data access and no heavy imports,
 * so list helpers and tests can use them without loading the database client.
 */

export const PLAYER_STATUSES = [
  { value: "active", label: "Active", tone: "emerald" },
  { value: "trial", label: "Trial", tone: "amber" },
  { value: "paused", label: "Inactive", tone: "slate" },
  { value: "suspended", label: "Suspended", tone: "rose" },
  { value: "graduated", label: "Graduated", tone: "indigo" },
  { value: "transferred", label: "Transferred", tone: "sky" },
  { value: "left", label: "Archived", tone: "zinc" },
] as const;

export type PlayerStatus = (typeof PLAYER_STATUSES)[number]["value"];

export const PLAYING_ROLES = [
  "Batter",
  "Bowler",
  "All-rounder",
  "Wicket-keeper",
  "Wicket-keeper batter",
] as const;

export const BATTING_STYLES = ["Right-hand", "Left-hand"] as const;
export const BOWLING_STYLES = [
  "Right-arm fast",
  "Right-arm medium",
  "Right-arm off-spin",
  "Right-arm leg-spin",
  "Left-arm fast",
  "Left-arm medium",
  "Left-arm orthodox",
  "Left-arm chinaman",
] as const;

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/** Age in years, or null if DOB missing/invalid. */
export function ageFromDob(dob?: string | null, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export const AGE_GROUPS = [
  { key: "u10", label: "Under 10", min: 0, max: 9 },
  { key: "u12", label: "Under 12", min: 10, max: 11 },
  { key: "u14", label: "Under 14", min: 12, max: 13 },
  { key: "u16", label: "Under 16", min: 14, max: 15 },
  { key: "u19", label: "Under 19", min: 16, max: 18 },
  { key: "sr", label: "Senior 19+", min: 19, max: 999 },
] as const;

export function inAgeGroup(age: number | null, key: string): boolean {
  const g = AGE_GROUPS.find((a) => a.key === key);
  if (!g || age === null) return false;
  return age >= g.min && age <= g.max;
}
