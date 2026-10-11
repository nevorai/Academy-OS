import { describe, it, expect } from "vitest";
import {
  LATE_GRACE_MS,
  batchMatchesSession,
  batchSessionBuckets,
  parseBatchStartMs,
} from "./roster";

describe("batchSessionBuckets", () => {
  it("reads keyword tags", () => {
    expect([...batchSessionBuckets("Morning batch")]).toEqual(["morning"]);
    expect([...batchSessionBuckets("Both")].sort()).toEqual(["evening", "morning"]);
    expect([...batchSessionBuckets("Personal coaching")]).toEqual(["night"]);
  });

  it("reads clock ranges", () => {
    expect([...batchSessionBuckets("6:00 AM – 10:00 AM")]).toEqual(["morning"]);
    expect([...batchSessionBuckets("4:00 PM – 8:00 PM")]).toEqual(["evening", "night"]);
    expect([...batchSessionBuckets("9 PM – 11 PM")]).toEqual(["night"]);
  });

  it("never hides a batch it cannot read", () => {
    expect([...batchSessionBuckets("")]).toEqual(["morning"]);
    expect([...batchSessionBuckets(null)]).toEqual(["morning"]);
  });

  it("'all' matches everything", () => {
    expect(batchMatchesSession("9 PM – 11 PM", "all")).toBe(true);
    expect(batchMatchesSession("9 PM – 11 PM", "morning")).toBe(false);
  });
});

describe("parseBatchStartMs", () => {
  it("uses the first clock time on the given day", () => {
    const ms = parseBatchStartMs("6:30 AM – 8:00 AM", "2026-10-11");
    expect(ms).toBe(new Date(2026, 9, 11, 6, 30).getTime());
  });

  it("handles 12 PM and 12 AM", () => {
    expect(parseBatchStartMs("12 PM", "2026-10-11")).toBe(new Date(2026, 9, 11, 12, 0).getTime());
    expect(parseBatchStartMs("12 AM", "2026-10-11")).toBe(new Date(2026, 9, 11, 0, 0).getTime());
  });

  it("returns null when there is no time", () => {
    expect(parseBatchStartMs("Morning batch", "2026-10-11")).toBeNull();
    expect(parseBatchStartMs(null, "2026-10-11")).toBeNull();
  });

  it("late threshold follows the day it is asked for (history bug)", () => {
    const yesterdayStart = parseBatchStartMs("6:00 AM", "2026-10-10")!;
    const checkIn = new Date(2026, 9, 10, 6, 25).getTime();
    expect(checkIn > yesterdayStart + LATE_GRACE_MS).toBe(true);
    // Against today's date the same check-in would never count as late.
    const todayStart = parseBatchStartMs("6:00 AM", "2026-10-11")!;
    expect(checkIn > todayStart + LATE_GRACE_MS).toBe(false);
  });
});
