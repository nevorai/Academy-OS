/**
 * Innings totals (runs, wickets, overs, balls) derived from the ball events, the single source of truth.
 *
 * Why this exists: the columns `mc_innings.runs / wickets / overs / balls` were never written by anything,
 * so every innings sat at 0/0 (0.0). Tournament run rate, "highest score", the bracket, the AI team report
 * and the scorer's win/tie suggestion all read those zeros (a finished match was suggested as "tied").
 *
 *  - `withDerivedTotals`  fills zero rows in memory (works for signed-out visitors, writes nothing).
 *  - `syncInningsTotals` / `syncMatchInningsTotals` save the true totals (scorers/owners, at completion).
 */
import { supabase } from "@/integrations/supabase/client";
import { calculateInningsStatistics } from "@/lib/mc-statistics-engine";

export type InningsTotals = { runs: number; wickets: number; overs: number; balls: number };
type Db = typeof supabase;
type MatchMeta = { overs: number | null; playing_rules: unknown };

const PAGE = 1000; // the API returns at most 1000 rows per request

async function fetchBalls(inningsId: string, db: Db) {
  const all: Awaited<ReturnType<typeof listPage>> = [];
  for (let from = 0; ; from += PAGE) {
    const page = await listPage(inningsId, from, db);
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

async function listPage(inningsId: string, from: number, db: Db) {
  const { data, error } = await db
    .from("mc_ball_events")
    .select("*")
    .eq("innings_id", inningsId)
    .order("sequence_number", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) throw error;
  return data ?? [];
}

async function matchMeta(matchIds: string[], db: Db): Promise<Map<string, MatchMeta>> {
  const { data } = await db.from("mc_matches").select("id, overs, playing_rules").in("id", matchIds);
  return new Map((data ?? []).map((m) => [m.id, { overs: m.overs ?? null, playing_rules: m.playing_rules }]));
}

export async function deriveInningsTotals(inningsId: string, meta: MatchMeta | undefined, db: Db = supabase): Promise<InningsTotals | null> {
  const balls = await fetchBalls(inningsId, db);
  if (balls.length === 0) return null;
  const rules = typeof meta?.playing_rules === "string" ? meta.playing_rules : null;
  const s = calculateInningsStatistics(balls, { totalOvers: meta?.overs ?? 0, playingRules: rules, target: null });
  return { runs: s.team.runs, wickets: s.team.wickets, overs: Math.floor(s.team.legalBalls / 6), balls: s.team.legalBalls % 6 };
}

const looksUnwritten = (r: InningsTotals) => r.runs === 0 && r.wickets === 0 && r.overs === 0 && r.balls === 0;

/** Rows whose stored totals are all zero get the true totals from their ball events (in memory only). */
export async function withDerivedTotals<T extends { id: string; match_id: string } & InningsTotals>(rows: T[], db: Db = supabase): Promise<T[]> {
  const todo = rows.filter(looksUnwritten);
  if (todo.length === 0) return rows;
  const meta = await matchMeta([...new Set(todo.map((r) => r.match_id))], db);
  const derived = new Map<string, InningsTotals>();
  await Promise.all(
    todo.map(async (r) => {
      try {
        const t = await deriveInningsTotals(r.id, meta.get(r.match_id), db);
        if (t) derived.set(r.id, t);
      } catch (e) {
        console.error("[innings-totals] could not derive", r.id, e);
      }
    }),
  );
  return rows.map((r) => (derived.has(r.id) ? { ...r, ...derived.get(r.id)! } : r));
}

/** Save the true totals of one innings (needs permission to edit the match: scorer / academy staff). */
export async function syncInningsTotals(inningsId: string, db: Db = supabase): Promise<InningsTotals | null> {
  const { data: inn } = await db.from("mc_innings").select("id, match_id").eq("id", inningsId).maybeSingle();
  if (!inn) return null;
  const meta = await matchMeta([inn.match_id], db);
  const totals = await deriveInningsTotals(inningsId, meta.get(inn.match_id), db);
  if (!totals) return null;
  const { error } = await db.from("mc_innings").update(totals).eq("id", inningsId);
  if (error) throw error;
  return totals;
}

/** Same, for every innings of a match. Never throws: a failed save must not block finishing a match. */
export async function syncMatchInningsTotals(matchId: string, db: Db = supabase): Promise<void> {
  try {
    const { data } = await db.from("mc_innings").select("id").eq("match_id", matchId);
    await Promise.all((data ?? []).map((i) => syncInningsTotals(i.id, db)));
  } catch (e) {
    console.error("[innings-totals] sync failed for match", matchId, e);
  }
}
