import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./fetch-all";

function fakeTable(n: number, failAt?: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  return () => ({
    range: async (a: number, b: number) =>
      failAt !== undefined && a >= failAt
        ? { data: null, error: { message: "boom" } }
        : { data: rows.slice(a, b + 1), error: null },
  });
}

describe("fetchAllRows", () => {
  it("returns every row past the 1,000 row API cap", async () => {
    const r = await fetchAllRows(fakeTable(2500));
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2500);
  });
  it("handles an exact multiple of the page size", async () => {
    const r = await fetchAllRows(fakeTable(2000));
    expect(r.data).toHaveLength(2000);
  });
  it("handles an empty table", async () => {
    const r = await fetchAllRows(fakeTable(0));
    expect(r.data).toEqual([]);
  });
  it("reports a failure on a later page instead of returning partial data", async () => {
    const r = await fetchAllRows(fakeTable(2500, 1000));
    expect(r.data).toBeNull();
    expect(r.error?.message).toBe("boom");
  });
});
