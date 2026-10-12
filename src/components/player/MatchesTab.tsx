import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Swords, Trophy } from "lucide-react";
import { Card } from "@/components/ds/Card";
import { usePlayerMatches } from "@/hooks/use-player-profile";
import { BrandIconBox, ChipPill, Skel } from "./parts";

export function MatchesTab({ athleteId }: { athleteId: string | null }) {
  const q = usePlayerMatches(athleteId);
  if (!athleteId) {
    return (
      <Card className="p-6 text-center">
        <Swords className="size-5 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground mb-2">Not linked to Match Center yet.</p>
        <Link to="/match-center" className="text-xs font-medium" style={{ color: "var(--brand)" }}>
          Open Match Center →
        </Link>
      </Card>
    );
  }
  if (q.isLoading) return <Skel />;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground text-center">No matches yet.</Card>;
  }

  return (
    <Card className="p-0 overflow-hidden">
      <ul className="divide-y divide-border">
        {rows.map((m) => (
          <li key={m.id} className="p-3 flex items-center gap-3">
            <BrandIconBox icon={Swords} className="size-9" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="text-sm font-medium truncate">
                  {m.match?.ground_name ?? "Match"}
                </div>
                {m.is_player_of_match ? (
                  <ChipPill tone="gold">
                    <Trophy className="size-2.5 mr-0.5" /> MoM
                  </ChipPill>
                ) : null}
                {m.is_captain ? <ChipPill>Captain</ChipPill> : null}
                {m.is_keeper ? <ChipPill>Keeper</ChipPill> : null}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {m.match?.scheduled_date
                  ? format(new Date(m.match.scheduled_date), "MMM d, yyyy")
                  : ""}
                {m.match?.match_format ? ` · ${m.match.match_format}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0 text-[11px] text-muted-foreground">
              {m.match?.status === "completed"
                ? (m.match?.result ?? "Completed")
                : (m.match?.status ?? "")}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
