import { describe, expect, it } from "vitest";
import {
  ageInYears,
  buildTimeline,
  lastDays,
  nextBirthday,
  noteAuthor,
  parseDay,
  tenure,
  type TimelineInput,
} from "./profile-stats";
import { parsePlayerTab } from "./profile-tabs";

const at = (iso: string) => new Date(iso);

describe("nextBirthday", () => {
  it("says today when the birthday is today, even late in the day", () => {
    const r = nextBirthday("2012-10-12", at("2026-10-12T21:30:00"));
    expect(r?.days).toBe(0);
  });
  it("counts the days to a birthday later this year", () => {
    expect(nextBirthday("2012-10-20", at("2026-10-12T09:00:00"))?.days).toBe(8);
  });
  it("rolls to next year once the birthday has passed", () => {
    const r = nextBirthday("2012-10-01", at("2026-10-12T09:00:00"));
    expect(r?.date.getFullYear()).toBe(2027);
    expect(r?.days).toBe(354);
  });
  it("returns null with no date of birth", () => {
    expect(nextBirthday(null)).toBeNull();
    expect(nextBirthday("not-a-date")).toBeNull();
  });
});

describe("ageInYears and parseDay", () => {
  it("counts whole years", () => {
    expect(ageInYears("2012-10-13", at("2026-10-12T09:00:00"))).toBe(13);
    expect(ageInYears("2012-10-12", at("2026-10-12T09:00:00"))).toBe(14);
  });
  it("reads a timestamp as its calendar day", () => {
    expect(parseDay("2026-03-04T23:30:00+00:00").getDate()).toBe(4);
  });
});

describe("tenure", () => {
  const now = at("2026-10-12T09:00:00");
  it("shows New in the first month", () => expect(tenure("2026-10-01", now)).toBe("New"));
  it("shows whole months under a year", () => expect(tenure("2026-05-12", now)).toBe("5 mo"));
  it("does not round a part month up", () => expect(tenure("2026-05-13", now)).toBe("4 mo"));
  it("shows years from one year on", () => expect(tenure("2024-10-12", now)).toBe("2y"));
  it("shows a dash with no or a future join date", () => {
    expect(tenure(null, now)).toBe("—");
    expect(tenure("2027-01-01", now)).toBe("—");
  });
});

describe("lastDays", () => {
  it("returns the requested number of days ending today", () => {
    const d = lastDays("2026-10-12", 30);
    expect(d).toHaveLength(30);
    expect(d[0].date).toBe("2026-09-13");
    expect(d[29].date).toBe("2026-10-12");
  });
  it("starts on the joining day for a new player", () => {
    const d = lastDays("2026-10-12", 30, "2026-10-09");
    expect(d.map((x) => x.date)).toEqual(["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"]);
  });
  it("ignores a joining day older than the window", () => {
    expect(lastDays("2026-10-12", 30, "2024-01-01")).toHaveLength(30);
  });
  it("is empty when the player joins in the future", () => {
    expect(lastDays("2026-10-12", 30, "2026-11-01")).toEqual([]);
  });
  it("numbers weekdays from Monday", () => {
    const d = lastDays("2026-10-12", 1); // a Monday
    expect(d[0].weekday).toBe(0);
  });
});

describe("buildTimeline", () => {
  const input: TimelineInput = {
    visits: [
      {
        mark_id: "m1",
        check_in_at: "2026-10-10T10:00:00+00:00",
        check_out_at: "2026-10-10T11:30:00+00:00",
        duration_minutes: 90,
        visit_type: "practice",
        note: null,
      },
    ],
    remarks: [
      { id: "r1", created_at: "2026-10-11T08:00:00Z", remark: "Good footwork", author_name: null },
    ],
    matches: [
      {
        id: "x1",
        is_captain: true,
        is_keeper: false,
        role: null,
        is_player_of_match: true,
        match: {
          scheduled_date: "2026-10-09",
          ground_name: "Main ground",
          result: "Won by 4 runs",
        },
      },
      {
        id: "x2",
        is_captain: false,
        is_keeper: false,
        role: null,
        is_player_of_match: false,
        match: { scheduled_date: null, ground_name: "Unscheduled", result: null },
      },
    ],
    payments: [{ id: "p1", amount: 1500, period: "2026-10", created_at: "2026-10-05T06:00:00Z" }],
  };

  it("merges everything newest first, comparing real moments", () => {
    const ids = buildTimeline(input).map((i) => i.id);
    expect(ids).toEqual(["note-r1", "out-m1", "in-m1", "match-x1", "pay-p1"]);
  });
  it("skips matches that have no date", () => {
    expect(buildTimeline(input).some((i) => i.id === "match-x2")).toBe(false);
  });
  it("marks a player-of-the-match appearance with the award icon and details", () => {
    const m = buildTimeline(input).find((i) => i.id === "match-x1");
    expect(m?.icon).toBe("award");
    expect(m?.meta).toBe("Captain · Player of Match");
  });
  it("formats the fee in Indian digits", () => {
    expect(buildTimeline(input).find((i) => i.id === "pay-p1")?.meta).toBe("₹1,500");
  });
  it("still lists a fee that has no period", () => {
    const r = buildTimeline({
      ...input,
      payments: [{ id: "p2", amount: 500, period: null, created_at: "2026-10-06T06:00:00Z" }],
    });
    expect(r.find((i) => i.id === "pay-p2")?.title).toBe("Fee paid");
  });
  it("names the author Coach when none is stored", () => {
    expect(buildTimeline(input).find((i) => i.id === "note-r1")?.meta).toBe("Coach");
  });
  it("filters by a search word in the title or details", () => {
    expect(buildTimeline({ ...input, query: "  FOOTWORK " }).map((i) => i.id)).toEqual(["note-r1"]);
    expect(buildTimeline({ ...input, query: "captain" }).map((i) => i.id)).toEqual(["match-x1"]);
    expect(buildTimeline({ ...input, query: "zzz" })).toEqual([]);
  });
});

describe("parsePlayerTab", () => {
  it("accepts known tabs only", () => {
    expect(parsePlayerTab("attendance")).toBe("attendance");
    expect(parsePlayerTab("billing")).toBeUndefined();
    expect(parsePlayerTab(3)).toBeUndefined();
    expect(parsePlayerTab(undefined)).toBeUndefined();
  });
});

describe("noteAuthor", () => {
  it("prefers the signed-in person's name", () => {
    expect(noteAuthor({ full_name: " Ravi Kumar " }, "coach")).toBe("Ravi Kumar");
    expect(noteAuthor({ name: "Meena" }, "owner")).toBe("Meena");
  });
  it("falls back to the role, never to the player's name", () => {
    expect(noteAuthor({}, "owner")).toBe("Owner");
    expect(noteAuthor(undefined, "coach")).toBe("Coach");
    expect(noteAuthor({ full_name: "  " }, null)).toBe("Coach");
  });
});
