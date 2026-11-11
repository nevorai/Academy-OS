/**
 * Read every row of a list, one page at a time.
 *
 * The database API hands back at most 1,000 rows per request, no matter what `.limit()` says,
 * and it does so silently. A list that grows past 1,000 (students, payments, attendance marks,
 * ball events) would then show wrong totals with no error. Wrap such reads in this helper.
 *
 * `make` must return a FRESH query each call and should end with a stable `.order(...)`,
 * so pages never overlap or skip rows.
 */
type PageResult = PromiseLike<{ data: unknown[] | null; error: unknown }>;
type Rows<Q extends { range(a: number, b: number): PageResult }> =
  Awaited<ReturnType<Q["range"]>> extends { data: infer D } ? NonNullable<D> : never;

export const PAGE_SIZE = 1000;
/** Safety stop: 200 pages = 200,000 rows. Far beyond any academy; stops a runaway loop. */
const MAX_PAGES = 200;

export async function fetchAllRows<Q extends { range(a: number, b: number): PageResult }>(
  make: () => Q,
  pageSize = PAGE_SIZE,
): Promise<{ data: Rows<Q>; error: null } | { data: null; error: Error }> {
  const out: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * pageSize;
    const res = await make().range(from, from + pageSize - 1);
    if (res.error) {
      const e = res.error as { message?: string };
      return { data: null, error: Object.assign(new Error(e?.message ?? "Query failed"), res.error) };
    }
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { data: out as unknown as Rows<Q>, error: null };
}
