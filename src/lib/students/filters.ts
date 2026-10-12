/**
 * Players list helpers: which players a set of filters lets through, the
 * numbers on the status tabs and the words for an empty list. Pure functions,
 * no data access, so they are easy to test.
 */

import {
  PLAYER_STATUSES,
  ageFromDob,
  inAgeGroup,
  type PlayerStatus,
} from "@/lib/students/constants";

/**
 * Primary status tabs: only the two states an academy manages day to day.
 * Every other status (trial, paused, suspended, graduated, transferred) is
 * still stored and is reached through "Advanced status" in the filters panel.
 */
export const PRIMARY_STATUS_TABS: readonly { key: string; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "left", label: "Left" },
];

export const ADVANCED_STATUSES: readonly PlayerStatus[] = [
  "trial",
  "paused",
  "suspended",
  "graduated",
  "transferred",
];

/** Playing-role choices in the filters panel. A group can cover several stored roles. */
export const ROLE_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "Batter", label: "Batter (incl. keepers & all-rounders)" },
  { value: "Bowler", label: "Bowler (incl. all-rounders)" },
  { value: "All-rounder", label: "All-rounder" },
  { value: "Wicket-keeper", label: "Wicketkeeper" },
];

export const GENDER_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "all", label: "All genders" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

/** The fields of a player row the list filters read. */
export interface FilterableStudent {
  status?: string | null;
  batch_id?: string | null;
  gender?: string | null;
  playing_role?: string | null;
  dob?: string | null;
  joined_at?: string | null;
  name?: string | null;
  phone?: string | null;
  player_id?: string | null;
  email?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  city?: string | null;
}

export interface StudentFilters {
  /** Free-text search. */
  q: string;
  /** A player status, or "all". */
  status: string;
  batch: string;
  gender: string;
  role: string;
  ageGroup: string;
  joinYear: string;
}

/** The filters panel in its untouched state (search and status are separate). */
export const PANEL_FILTERS_OFF = {
  batch: "all",
  gender: "all",
  role: "all",
  ageGroup: "all",
  joinYear: "all",
} as const satisfies Partial<StudentFilters>;

export function defaultFilters(status = "active"): StudentFilters {
  return { q: "", status, ...PANEL_FILTERS_OFF };
}

/** How many filters in the panel are switched on (the number on the Filters button). */
export function activeFilterCount(f: StudentFilters): number {
  return (
    (f.batch !== "all" ? 1 : 0) +
    (f.gender !== "all" ? 1 : 0) +
    (f.role !== "all" ? 1 : 0) +
    (f.ageGroup !== "all" ? 1 : 0) +
    (f.joinYear !== "all" ? 1 : 0)
  );
}

/**
 * Does a stored playing role belong to the chosen role group?
 * Keepers count as batters (wicketkeeper-batter), all-rounders count as both
 * batters and bowlers. Stored roles come in many spellings ("Wicket-keeper
 * batter", "wicket_keeper", "Allrounder"), so they are normalised first.
 */
export function playingRoleMatches(playingRole: string | null | undefined, role: string): boolean {
  if (role === "all") return true;
  const pr = String(playingRole ?? "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  const isKeeper =
    pr === "wicket-keeper" ||
    pr === "wicket-keeper-batter" ||
    pr === "wicketkeeper" ||
    pr === "wicketkeeper-batsman";
  const isAllRounder = pr === "all-rounder" || pr === "allrounder";
  const isBowler = pr === "bowler" || isAllRounder;
  const isBatter = pr === "batter" || pr === "batsman" || isAllRounder || isKeeper;
  if (role === "Batter") return isBatter;
  if (role === "Bowler") return isBowler;
  if (role === "All-rounder") return isAllRounder;
  if (role === "Wicket-keeper") return isKeeper;
  return pr === role.toLowerCase();
}

/** Free-text search over the things an owner types: name, phones, Player ID, parent, city. */
export function searchMatches(s: FilterableStudent, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [s.name, s.phone, s.player_id, s.email, s.guardian_name, s.guardian_phone, s.city]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export interface FilterOptions {
  /** When given, only players in these batches pass (a coach's "My batches only"). */
  onlyBatchIds?: ReadonlySet<string> | null;
  /** The clock used to work out ages. Tests pass a fixed date. */
  now?: Date;
}

export function studentMatches(
  s: FilterableStudent,
  f: StudentFilters,
  { onlyBatchIds, now }: FilterOptions = {},
): boolean {
  if (f.status !== "all" && s.status !== f.status) return false;
  if (f.batch !== "all" && s.batch_id !== f.batch) return false;
  if (onlyBatchIds && !onlyBatchIds.has(s.batch_id ?? "")) return false;
  if (f.gender !== "all" && (s.gender ?? "").toLowerCase() !== f.gender) return false;
  if (!playingRoleMatches(s.playing_role, f.role)) return false;
  if (f.ageGroup !== "all" && !inAgeGroup(ageFromDob(s.dob, now), f.ageGroup)) return false;
  if (f.joinYear !== "all" && !(s.joined_at ?? "").startsWith(f.joinYear)) return false;
  return searchMatches(s, f.q);
}

export function filterStudents<T extends FilterableStudent>(
  list: readonly T[],
  f: StudentFilters,
  options: FilterOptions = {},
): T[] {
  return list.filter((s) => studentMatches(s, f, options));
}

/** Players per status, plus `all`. Every known status is present, even at zero. */
export function countByStatus(list: readonly FilterableStudent[]): Record<string, number> {
  const by: Record<string, number> = { all: list.length };
  for (const meta of PLAYER_STATUSES) by[meta.value] = 0;
  for (const s of list) {
    const key = s.status ?? "";
    if (key in by && key !== "all") by[key]++;
  }
  return by;
}

/** The years players joined in, newest first (the "Joining year" choices). */
export function joinYearsOf(list: readonly FilterableStudent[]): string[] {
  const set = new Set<string>();
  for (const s of list) {
    const y = s.joined_at ? String(s.joined_at).slice(0, 4) : null;
    if (y) set.add(y);
  }
  return Array.from(set).sort().reverse();
}

/** What to say when the list is empty, and whether an "Add Player" button makes sense there. */
export function emptyListState(q: string, status: string): { message: string; offerAdd: boolean } {
  if (q.trim()) return { message: "No players match your search.", offerAdd: false };
  if (status === "active") return { message: "No active players found.", offerAdd: true };
  if (status === "left") return { message: "No players have left the academy.", offerAdd: false };
  return { message: "No players yet.", offerAdd: status === "all" };
}
