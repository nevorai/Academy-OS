/* ================================================================
 * Match rules that depend on the size of the side.
 * ----------------------------------------------------------------
 * Academy matches are often 8, 9 or 11 a side. "All out" and "won by N
 * wickets" must follow the number of players who batted for the side, not a
 * fixed 10. Pure helpers, no database access.
 * ================================================================ */

export interface SquadLite {
  team_id: string;
  is_playing?: boolean | null;
  is_substitute?: boolean | null;
}

/**
 * Players on one side for this match: the playing XI (not substitutes).
 * Falls back to everyone listed for the team. Null when the team has no squad.
 */
export function playersPerSide(squad: readonly SquadLite[], teamId: string | null): number | null {
  if (!teamId) return null;
  const side = squad.filter((p) => p.team_id === teamId);
  if (side.length === 0) return null;
  const xi = side.filter((p) => p.is_playing !== false && !p.is_substitute);
  return xi.length > 0 ? xi.length : side.length;
}

/**
 * Wickets that bowl a side out. 11 players means 10 wickets, 8 players means 7.
 * Capped at 10 (a squad longer than 11 includes players who will not bat);
 * unknown or tiny sides fall back to 10.
 */
export function wicketLimit(players: number | null | undefined): number {
  if (!players || players < 2) return 10;
  return Math.min(10, players - 1);
}

export function wicketLimitForTeam(squad: readonly SquadLite[], teamId: string | null): number {
  return wicketLimit(playersPerSide(squad, teamId));
}
