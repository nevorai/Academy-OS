import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Row = {
  id: string | null; // null = new player
  team_id: string;
  athlete_profile_id: string | null;
  name: string;
  locked: boolean; // academy player: name comes from the academy
  is_captain: boolean;
  is_vice_captain: boolean;
  is_keeper: boolean;
  batting_order: number;
};
type Team = { id: string; name: string; rows: Row[] };

/** Fix team names, player names and Captain / Vice-captain / Keeper for a match that is already started. */
export function EditTeamsSheet({
  open,
  onOpenChange,
  tenantId,
  matchId,
  teamAId,
  teamBId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  matchId: string;
  teamAId: string;
  teamBId: string;
  onSaved: () => void;
}) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const out: Team[] = [];
      for (const id of [teamAId, teamBId]) {
        const [{ data: t }, { data: sq }] = await Promise.all([
          supabase.from("mc_teams").select("id, name").eq("id", id).maybeSingle(),
          supabase
            .from("mc_match_squads")
            .select("*")
            .eq("match_id", matchId)
            .eq("team_id", id)
            .order("batting_order", { ascending: true, nullsFirst: false }),
        ]);
        const ids = (sq ?? []).map((r) => r.athlete_profile_id).filter((x): x is string => !!x);
        const names: Record<string, string> = {};
        if (ids.length) {
          const { data } = await supabase
            .from("mc_athlete_profiles")
            .select("id, students:student_id(name)")
            .in("id", ids);
          (data ?? []).forEach((r: { id: string; students: { name: string } | null }) => {
            if (r.students?.name) names[r.id] = r.students.name;
          });
        }
        out.push({
          id,
          name: t?.name ?? "Team",
          rows: (sq ?? []).map((r, i) => ({
            id: r.id,
            team_id: id,
            athlete_profile_id: r.athlete_profile_id,
            name:
              (r.athlete_profile_id && names[r.athlete_profile_id]) ||
              r.external_player_name ||
              "Player",
            locked: !!r.athlete_profile_id,
            is_captain: r.is_captain,
            is_vice_captain: r.is_vice_captain,
            is_keeper: r.is_keeper,
            batting_order: r.batting_order ?? i + 1,
          })),
        });
      }
      if (alive) setTeams(out);
    })();
    return () => {
      alive = false;
    };
  }, [open, matchId, teamAId, teamBId]);

  const patchRow = (ti: number, ri: number, patch: Partial<Row>) =>
    setTeams((all) =>
      all
        ? all.map((t, i) =>
            i !== ti
              ? t
              : { ...t, rows: t.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) },
          )
        : all,
    );

  const setRole = (ti: number, ri: number, role: "C" | "VC" | "WK") =>
    setTeams((all) =>
      all
        ? all.map((t, i) =>
            i !== ti
              ? t
              : {
                  ...t,
                  rows: t.rows.map((r, j) => {
                    const on = j === ri;
                    if (role === "C") return { ...r, is_captain: on ? !r.is_captain : false };
                    if (role === "VC")
                      return { ...r, is_vice_captain: on ? !r.is_vice_captain : false };
                    return { ...r, is_keeper: on ? !r.is_keeper : false };
                  }),
                },
          )
        : all,
    );

  const addPlayer = (ti: number) =>
    setTeams((all) =>
      all
        ? all.map((t, i) =>
            i !== ti
              ? t
              : {
                  ...t,
                  rows: [
                    ...t.rows,
                    {
                      id: null,
                      team_id: t.id,
                      athlete_profile_id: null,
                      name: "",
                      locked: false,
                      is_captain: false,
                      is_vice_captain: false,
                      is_keeper: false,
                      batting_order: t.rows.length + 1,
                    },
                  ],
                },
          )
        : all,
    );

  const save = async () => {
    if (!teams) return;
    for (const t of teams) {
      if (!t.name.trim()) return toast.error("Team name is required");
      if (!t.rows.some((r) => r.is_captain)) return toast.error(`${t.name}: pick a Captain`);
      if (!t.rows.some((r) => r.is_keeper)) return toast.error(`${t.name}: pick a Wicketkeeper`);
    }
    setSaving(true);
    try {
      for (const t of teams) {
        const { error: te } = await supabase
          .from("mc_teams")
          .update({ name: t.name.trim() })
          .eq("id", t.id);
        if (te) throw te;
        for (const r of t.rows) {
          if (!r.id) {
            if (!r.name.trim()) continue;
            const { error } = await supabase.from("mc_match_squads").insert({
              tenant_id: tenantId,
              match_id: matchId,
              team_id: t.id,
              external_player_name: r.name.trim(),
              batting_order: r.batting_order,
              is_playing: true,
              is_captain: r.is_captain,
              is_vice_captain: r.is_vice_captain,
              is_keeper: r.is_keeper,
              is_substitute: false,
            });
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("mc_match_squads")
              .update({
                ...(r.locked ? {} : { external_player_name: r.name.trim() || null }),
                is_captain: r.is_captain,
                is_vice_captain: r.is_vice_captain,
                is_keeper: r.is_keeper,
              })
              .eq("id", r.id);
            if (error) throw error;
          }
        }
      }
      toast.success("Teams saved");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[88dvh] flex-col gap-0 rounded-t-2xl p-0 pb-[var(--app-safe-bottom)]"
      >
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle className="text-base">Edit teams</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-3">
          {!teams ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            teams.map((t, ti) => (
              <section key={t.id}>
                <input
                  value={t.name}
                  onChange={(e) =>
                    setTeams((all) =>
                      all
                        ? all.map((x, i) => (i === ti ? { ...x, name: e.target.value } : x))
                        : all,
                    )
                  }
                  aria-label={`Team ${ti === 0 ? "A" : "B"} name`}
                  className="mb-1.5 h-10 w-full rounded-lg border border-border bg-card px-3 text-[16px] font-bold"
                />
                <ol className="divide-y divide-border rounded-xl border border-border bg-card">
                  {t.rows.map((r, ri) => (
                    <li key={r.id ?? `new-${ri}`} className="flex items-center gap-1.5 px-2 py-1">
                      <span className="w-5 shrink-0 text-center text-[12px] text-muted-foreground">
                        {ri + 1}
                      </span>
                      <input
                        value={r.name}
                        readOnly={r.locked}
                        placeholder="Player name"
                        onChange={(e) => patchRow(ti, ri, { name: e.target.value })}
                        className={cn(
                          "h-9 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[16px] font-semibold outline-none focus:bg-muted/60",
                          r.locked && "text-foreground/80",
                        )}
                      />
                      {(["C", "VC", "WK"] as const).map((role) => {
                        const on =
                          role === "C"
                            ? r.is_captain
                            : role === "VC"
                              ? r.is_vice_captain
                              : r.is_keeper;
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => setRole(ti, ri, role)}
                            className={cn(
                              "grid size-8 shrink-0 place-items-center rounded-full border text-[10px] font-bold",
                              on
                                ? role === "C"
                                  ? "border-amber-500 bg-amber-500 text-white"
                                  : role === "VC"
                                    ? "border-sky-500 bg-sky-500 text-white"
                                    : "border-emerald-600 bg-emerald-600 text-white"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={() => addPlayer(ti)}
                  className="mt-1.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[13px] font-semibold text-muted-foreground"
                >
                  <Plus className="size-4" /> Add player
                </button>
              </section>
            ))
          )}
        </div>
        <div className="flex gap-2 border-t p-3">
          <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 flex-[2]" disabled={saving || !teams} onClick={save}>
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
