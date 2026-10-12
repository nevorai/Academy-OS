import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ClipboardCheck, FileText, StickyNote, Swords, Trophy, UserRound } from "lucide-react";
import type { ComponentType } from "react";
import { Card } from "@/components/ds/Card";
import { SearchBar } from "@/components/ds/SearchBar";
import { supabase } from "@/integrations/supabase/client";
import {
  usePlayerAttendance,
  usePlayerMatches,
  usePlayerRemarks,
} from "@/hooks/use-player-profile";
import { buildTimeline, type TimelineIcon, type TimelineTone } from "@/lib/students/profile-stats";
import { Skel } from "./parts";

const ICONS: Record<TimelineIcon, ComponentType<{ className?: string }>> = {
  in: ClipboardCheck,
  out: ClipboardCheck,
  note: StickyNote,
  match: Swords,
  award: Trophy,
  payment: FileText,
};

const DOT: Record<TimelineTone, string> = {
  brand: "var(--brand)",
  success: "rgb(16 185 129)",
  info: "rgb(14 165 233)",
  muted: "var(--muted-foreground)",
};

/** Check-ins, notes, matches and fees in one list, newest first, with a search box. */
export function TimelineTab({
  tenantId,
  studentId,
  athleteId,
}: {
  tenantId: string;
  studentId: string;
  athleteId: string | null;
}) {
  const [q, setQ] = useState("");
  const visitsQ = usePlayerAttendance(tenantId, studentId);
  const remarksQ = usePlayerRemarks(studentId);
  const matchesQ = usePlayerMatches(athleteId);
  const paymentsQ = useQuery({
    queryKey: ["player", "payments", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, period, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useMemo(
    () =>
      buildTimeline({
        visits: visitsQ.data?.visits ?? [],
        remarks: remarksQ.data ?? [],
        matches: matchesQ.data ?? [],
        payments: paymentsQ.data ?? [],
        query: q,
      }),
    [visitsQ.data, remarksQ.data, matchesQ.data, paymentsQ.data, q],
  );

  const loading = visitsQ.isLoading || remarksQ.isLoading || matchesQ.isLoading;

  return (
    <div className="space-y-3">
      <SearchBar value={q} onChange={setQ} placeholder="Search timeline…" />
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skel key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <UserRound className="size-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {q ? "No matching events." : "Timeline is empty. Player activity will appear here."}
          </p>
        </Card>
      ) : (
        <ol className="relative ml-2 border-l border-border pl-4 space-y-3">
          {items.map((it) => {
            const Icon = ICONS[it.icon];
            return (
              <li key={it.id} className="relative">
                <span
                  className="absolute -left-[21px] top-1 grid place-items-center size-3.5 rounded-full ring-4 ring-background"
                  style={{ backgroundColor: DOT[it.tone] }}
                >
                  <Icon className="size-2 text-white" />
                </span>
                <div className="flex items-baseline gap-2">
                  <div className="text-sm font-medium truncate">{it.title}</div>
                  <div className="text-[10.5px] text-muted-foreground shrink-0 ml-auto">
                    {formatDistanceToNow(new Date(it.at), { addSuffix: true })}
                  </div>
                </div>
                {it.meta ? (
                  <div className="text-[11.5px] text-muted-foreground mt-0.5">{it.meta}</div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
