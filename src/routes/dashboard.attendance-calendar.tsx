/**
 * Attendance calendar (owner / admin / coach): a whole batch for a month,
 * lowest attendance first. Tap a player for their own calendar.
 * Marks are still made on the Attendance page.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { fetchBatches, qk } from "@/lib/dashboard-queries";
import {
  BatchAttendanceStrips,
  MonthNav,
  PlayerAttendanceCalendar,
  type StripPlayer,
} from "@/components/attendance/AttendanceCalendar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/dashboard/attendance-calendar")({
  head: () => ({
    meta: [
      { title: "Attendance calendar · Nevorai Academy" },
      { name: "description", content: "Who came, who was late and who missed, for the whole month." },
    ],
  }),
  component: AttendanceCalendarPage,
});

function AttendanceCalendarPage() {
  const { tenant } = useDashboard();
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), m0: now.getMonth() });
  const [batchId, setBatchId] = useState<string | null>(null);
  const [open, setOpen] = useState<StripPlayer | null>(null);

  const batches = useQuery({
    queryKey: qk.batches(tenant.id),
    queryFn: () => fetchBatches(tenant.id),
    staleTime: 30_000,
  });
  useEffect(() => {
    if (!batchId && batches.data?.length) setBatchId(batches.data[0].id);
  }, [batches.data, batchId]);

  const players = useQuery({
    enabled: !!batchId,
    queryKey: ["attendance", "cal-players", tenant.id, batchId],
    staleTime: 30_000,
    queryFn: async (): Promise<StripPlayer[]> => {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, player_id")
        .eq("tenant_id", tenant.id)
        .eq("batch_id", batchId!)
        .eq("status", "active")
        .order("name")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as StripPlayer[];
    },
  });

  const list = useMemo(() => players.data ?? [], [players.data]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-24 pt-4">
      <div className="flex items-center gap-2">
        <Link
          to="/dashboard/attendance"
          aria-label="Back to attendance"
          className="grid size-9 place-items-center rounded-full border border-border/60 active:scale-95"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-lg font-bold">Attendance calendar</h1>
      </div>

      {batches.isLoading ? (
        <Skeleton className="h-10 w-full rounded-xl" />
      ) : (batches.data?.length ?? 0) === 0 ? (
        <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">
          Create a batch and add players first.
        </p>
      ) : (
        <Select value={batchId ?? undefined} onValueChange={setBatchId}>
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Choose a batch" />
          </SelectTrigger>
          <SelectContent>
            {(batches.data ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
                {b.timing ? ` · ${b.timing}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <MonthNav year={ym.year} m0={ym.m0} onChange={setYm} />

      {batchId &&
        (players.isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : (
          <BatchAttendanceStrips
            tenantId={tenant.id}
            batchId={batchId}
            players={list}
            year={ym.year}
            m0={ym.m0}
            onOpen={setOpen}
          />
        ))}

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{open?.name}</DialogTitle>
            <DialogDescription>{open?.player_id ? `Player ID ${open.player_id}` : "Month view"}</DialogDescription>
          </DialogHeader>
          {open && batchId && (
            <PlayerAttendanceCalendar tenantId={tenant.id} studentId={open.id} batchId={batchId} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
