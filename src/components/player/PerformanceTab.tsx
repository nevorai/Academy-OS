import { Layers, ShieldAlert, Sparkles, Trophy } from "lucide-react";
import { Card } from "@/components/ds/Card";
import { usePlayerCareer } from "@/hooks/use-player-profile";
import { KpiTile, SectionHeader, Skel } from "./parts";

const fixed = (n: number | null | undefined, digits = 1) =>
  n != null ? Number(n).toFixed(digits) : "—";

export function PerformanceTab({ athleteId }: { athleteId: string | null }) {
  const q = usePlayerCareer(athleteId);

  if (!athleteId) {
    return (
      <Card className="p-6 text-center">
        <Sparkles className="size-5 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Link this player to Match Center to see performance stats.
        </p>
      </Card>
    );
  }
  if (q.isLoading) return <Skel />;
  const c = q.data;
  if (!c) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No performance data yet.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <SectionHeader icon={Trophy} title="Batting" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <KpiTile label="Innings" value={c.innings} />
          <KpiTile label="Runs" value={c.runs} />
          <KpiTile label="Avg" value={fixed(c.average)} />
          <KpiTile label="SR" value={fixed(c.strike_rate)} />
          <KpiTile label="50s / 100s" value={`${c.fifties} / ${c.hundreds}`} />
          <KpiTile label="HS" value={c.highest_score ?? "—"} />
        </div>
      </Card>
      <Card className="p-4">
        <SectionHeader icon={ShieldAlert} title="Bowling" />
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          <KpiTile label="Wickets" value={c.wickets} />
          <KpiTile label="Avg" value={fixed(c.bowling_average)} />
          <KpiTile label="Econ" value={fixed(c.economy, 2)} />
          <KpiTile label="Best" value={c.best_bowling ?? "—"} />
        </div>
      </Card>
      <Card className="p-4">
        <SectionHeader icon={Layers} title="Fielding & Recognition" />
        <div className="grid grid-cols-3 gap-2">
          <KpiTile label="Catches" value={c.catches} />
          <KpiTile label="Player of Match" value={c.player_of_match} />
          <KpiTile label="Matches" value={c.matches} />
        </div>
      </Card>
    </div>
  );
}
