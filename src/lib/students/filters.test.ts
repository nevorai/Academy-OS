import { describe, it, expect } from "vitest";
import {
  activeFilterCount,
  countByStatus,
  defaultFilters,
  emptyListState,
  filterStudents,
  joinYearsOf,
  playingRoleMatches,
  searchMatches,
  type FilterableStudent,
} from "./filters";

const NOW = new Date(2026, 9, 11); // 11 Oct 2026

const players: (FilterableStudent & { id: string })[] = [
  {
    id: "a",
    name: "Rahul Sharma",
    phone: "9876543210",
    player_id: "SSA-2026-0001",
    status: "active",
    batch_id: "b1",
    gender: "Male",
    playing_role: "Batter",
    dob: "2014-01-15", // 12
    joined_at: "2026-04-02",
    guardian_name: "Sunil Sharma",
    city: "Chhatarpur",
  },
  {
    id: "b",
    name: "Priya Singh",
    phone: "9000000001",
    status: "active",
    batch_id: "b2",
    gender: "female",
    playing_role: "Wicket-keeper batter",
    dob: "2010-12-01", // 15
    joined_at: "2025-06-10",
  },
  {
    id: "c",
    name: "Aman",
    phone: "9000000002",
    status: "left",
    batch_id: "b1",
    gender: null,
    playing_role: "all_rounder",
    dob: null,
    joined_at: null,
  },
  {
    id: "d",
    name: "Dev Verma",
    phone: "9000000003",
    status: "trial",
    batch_id: null,
    gender: "male",
    playing_role: "Bowler",
    dob: "2005-03-03", // 21
    joined_at: "2026-01-20",
  },
];

const ids = (list: { id: string }[]) => list.map((p) => p.id).join("");
const f = (over: Partial<ReturnType<typeof defaultFilters>> = {}) => ({
  ...defaultFilters("all"),
  ...over,
});

describe("playingRoleMatches", () => {
  it("lets every role through when no role is chosen", () => {
    expect(playingRoleMatches(null, "all")).toBe(true);
    expect(playingRoleMatches("Bowler", "all")).toBe(true);
  });

  it("counts keepers and all-rounders as batters", () => {
    for (const r of ["Batter", "batsman", "All-rounder", "Wicket-keeper", "Wicket-keeper batter"]) {
      expect(playingRoleMatches(r, "Batter")).toBe(true);
    }
    expect(playingRoleMatches("Bowler", "Batter")).toBe(false);
  });

  it("counts all-rounders as bowlers, but not keepers", () => {
    expect(playingRoleMatches("Bowler", "Bowler")).toBe(true);
    expect(playingRoleMatches("allrounder", "Bowler")).toBe(true);
    expect(playingRoleMatches("Wicket-keeper", "Bowler")).toBe(false);
  });

  it("reads the spellings that are stored", () => {
    expect(playingRoleMatches("wicket_keeper", "Wicket-keeper")).toBe(true);
    expect(playingRoleMatches("Wicketkeeper Batsman", "Wicket-keeper")).toBe(true);
    expect(playingRoleMatches("all rounder", "All-rounder")).toBe(true);
    expect(playingRoleMatches("Batter", "All-rounder")).toBe(false);
  });

  it("never matches a player with no role once a role is chosen", () => {
    expect(playingRoleMatches(null, "Batter")).toBe(false);
    expect(playingRoleMatches("", "Bowler")).toBe(false);
  });
});

describe("searchMatches", () => {
  it("looks in name, phone, Player ID, parent and city, in any letter case", () => {
    expect(searchMatches(players[0], "rahul")).toBe(true);
    expect(searchMatches(players[0], "98765")).toBe(true);
    expect(searchMatches(players[0], "ssa-2026")).toBe(true);
    expect(searchMatches(players[0], "SUNIL")).toBe(true);
    expect(searchMatches(players[0], "chhatar")).toBe(true);
    expect(searchMatches(players[0], "priya")).toBe(false);
  });

  it("treats spaces alone as no search, and ignores spaces around the text", () => {
    expect(searchMatches(players[2], "   ")).toBe(true); // one-word name, no space in it
    expect(searchMatches(players[0], "  rahul ")).toBe(true);
  });
});

describe("filterStudents", () => {
  it("returns everyone when nothing is chosen", () => {
    expect(ids(filterStudents(players, f(), { now: NOW }))).toBe("abcd");
  });

  it("filters by status", () => {
    expect(ids(filterStudents(players, f({ status: "active" }), { now: NOW }))).toBe("ab");
    expect(ids(filterStudents(players, f({ status: "left" }), { now: NOW }))).toBe("c");
    expect(ids(filterStudents(players, f({ status: "trial" }), { now: NOW }))).toBe("d");
  });

  it("filters by batch and by gender whatever the stored letter case", () => {
    expect(ids(filterStudents(players, f({ batch: "b1" }), { now: NOW }))).toBe("ac");
    expect(ids(filterStudents(players, f({ gender: "male" }), { now: NOW }))).toBe("ad");
    expect(ids(filterStudents(players, f({ gender: "female" }), { now: NOW }))).toBe("b");
  });

  it("filters by age group and leaves out players with no birth date", () => {
    expect(ids(filterStudents(players, f({ ageGroup: "u14" }), { now: NOW }))).toBe("a");
    expect(ids(filterStudents(players, f({ ageGroup: "u16" }), { now: NOW }))).toBe("b");
    expect(ids(filterStudents(players, f({ ageGroup: "sr" }), { now: NOW }))).toBe("d");
  });

  it("filters by joining year and by role group", () => {
    expect(ids(filterStudents(players, f({ joinYear: "2026" }), { now: NOW }))).toBe("ad");
    expect(ids(filterStudents(players, f({ role: "Batter" }), { now: NOW }))).toBe("abc");
    expect(ids(filterStudents(players, f({ role: "Bowler" }), { now: NOW }))).toBe("cd");
  });

  it("keeps a coach to their own batches, which also hides players with no batch", () => {
    const mine = new Set(["b1"]);
    expect(ids(filterStudents(players, f(), { onlyBatchIds: mine, now: NOW }))).toBe("ac");
    expect(ids(filterStudents(players, f(), { onlyBatchIds: new Set(), now: NOW }))).toBe("");
    expect(ids(filterStudents(players, f(), { onlyBatchIds: null, now: NOW }))).toBe("abcd");
  });

  it("combines filters with the search", () => {
    const got = filterStudents(players, f({ status: "active", batch: "b1", q: "sharma" }), {
      now: NOW,
    });
    expect(ids(got)).toBe("a");
  });
});

describe("countByStatus", () => {
  it("counts every status and keeps the unused ones at zero", () => {
    const by = countByStatus(players);
    expect(by.all).toBe(4);
    expect(by.active).toBe(2);
    expect(by.left).toBe(1);
    expect(by.trial).toBe(1);
    expect(by.paused).toBe(0);
    expect(by.graduated).toBe(0);
  });

  it("does not let an odd stored status change the totals", () => {
    const by = countByStatus([{ status: "all" }, { status: "weird" }, { status: null }]);
    expect(by.all).toBe(3);
    expect(by.active).toBe(0);
    expect(by.weird).toBeUndefined();
  });
});

describe("joinYearsOf / activeFilterCount / emptyListState", () => {
  it("lists joining years newest first, once each", () => {
    expect(joinYearsOf(players)).toEqual(["2026", "2025"]);
    expect(joinYearsOf([])).toEqual([]);
  });

  it("counts only the panel filters, not search or status", () => {
    expect(activeFilterCount(defaultFilters())).toBe(0);
    expect(activeFilterCount(f({ q: "x", status: "left" }))).toBe(0);
    expect(activeFilterCount(f({ batch: "b1", role: "Bowler", joinYear: "2026" }))).toBe(3);
  });

  it("picks the right words for an empty list", () => {
    expect(emptyListState("zz", "active")).toEqual({
      message: "No players match your search.",
      offerAdd: false,
    });
    expect(emptyListState("", "active")).toEqual({
      message: "No active players found.",
      offerAdd: true,
    });
    expect(emptyListState(" ", "left")).toEqual({
      message: "No players have left the academy.",
      offerAdd: false,
    });
    expect(emptyListState("", "trial")).toEqual({ message: "No players yet.", offerAdd: false });
    expect(emptyListState("", "all")).toEqual({ message: "No players yet.", offerAdd: true });
  });
});
