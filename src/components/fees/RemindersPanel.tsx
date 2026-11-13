import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { MessageCircle, Check, RefreshCw } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { supabase } from "@/integrations/supabase/client";
import { periodLabel } from "@/lib/fees";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/shared/FilterTabs";

type ReminderStatus = "queued" | "sent" | "dismissed";
type Reminder = {
  id: string;
  tenant_id: string;
  student_id: string;
  period: string;
  channel: string;
  message: string | null;
  whatsapp_url: string | null;
  phone: string | null;
  amount: number | null;
  status: ReminderStatus;
  sent_at: string | null;
  created_at: string;
  students: { name: string; guardian_name: string | null } | null;
};

const FIELDS = "*, students(name, guardian_name)";

/** The daily job queues one row per overdue player per DAY, so the same player piles up. Show each player once per month (newest row) and remember how many rows it stands for. */
function onePerPlayer(rows: Reminder[]): (Reminder & { copies: string[] })[] {
  const seen = new Map<string, Reminder & { copies: string[] }>();
  for (const r of rows) {
    const k = `${r.student_id}|${r.period}`;
    const hit = seen.get(k);
    if (hit) hit.copies.push(r.id);
    else seen.set(k, { ...r, copies: [r.id] });
  }
  return [...seen.values()];
}

export function RemindersPanel() {
  const { tenant } = useDashboard();
  const qc = useQueryClient();
  const [tab, setTab] = useState<ReminderStatus>("queued");
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["d", "reminders", tenant.id],
    // One trip: the three lists are asked for together, newest first.
    queryFn: async (): Promise<Record<ReminderStatus, Reminder[]>> => {
      const ask = (status: ReminderStatus, limit: number) =>
        supabase
          .from("reminder_logs" as never)
          .select(FIELDS)
          .eq("tenant_id", tenant.id)
          .eq("status", status)
          .order("created_at", { ascending: false })
          .limit(limit);
      const [q, s, d] = await Promise.all([
        ask("queued", 600),
        ask("sent", 100),
        ask("dismissed", 100),
      ]);
      const bad = q.error ?? s.error ?? d.error;
      if (bad) throw bad;
      return {
        queued: (q.data ?? []) as unknown as Reminder[],
        sent: (s.data ?? []) as unknown as Reminder[],
        dismissed: (d.data ?? []) as unknown as Reminder[],
      };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["d", "reminders", tenant.id] });

  const setStatus = useMutation({
    // `ids` = every queued row for the same player and month, so the player leaves the queue in one tap.
    mutationFn: async ({ ids, status }: { ids: string[]; status: ReminderStatus }) => {
      const patch =
        status === "sent"
          ? { status, sent_at: new Date().toISOString() }
          : { status, sent_at: null };
      const { error } = await supabase
        .from("reminder_logs" as never)
        .update(patch as never)
        .eq("tenant_id", tenant.id)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "sent" ? "Marked as sent" : "Removed from the list");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lists = useMemo(
    () => ({
      queued: onePerPlayer(data?.queued ?? []),
      sent: onePerPlayer(data?.sent ?? []),
      dismissed: onePerPlayer(data?.dismissed ?? []),
    }),
    [data],
  );
  const rows = lists[tab];

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight md:text-lg">Fee reminders</h2>
          <p className="text-xs text-muted-foreground md:text-sm">
            Made every morning for unpaid fees. Tap Send to open WhatsApp.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`size-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <FilterTabs
        value={tab}
        onChange={setTab}
        items={[
          { key: "queued", label: "To send", count: lists.queued.length },
          { key: "sent", label: "Sent", count: lists.sent.length },
          { key: "dismissed", label: "Skipped", count: lists.dismissed.length },
        ]}
      />

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && rows.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {tab === "queued"
            ? "Nothing to send. New reminders appear here every morning for unpaid fees."
            : tab === "sent"
              ? "No reminders sent yet."
              : "Nothing skipped."}
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="divide-y divide-border overflow-hidden p-0">
          {rows.map((r) => (
            <div key={r.id} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                  aria-expanded={open === r.id}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] font-semibold">
                      {r.students?.name ?? "Unknown player"}
                    </span>
                    {r.amount != null && (
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        ₹{Number(r.amount).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {periodLabel(r.period)}
                    {r.sent_at
                      ? ` · sent ${format(new Date(r.sent_at), "d MMM h:mma")}`
                      : ` · ${format(new Date(r.created_at), "d MMM")}`}
                    {r.message ? " · see message" : ""}
                  </div>
                </button>
                {r.whatsapp_url && tab !== "sent" && (
                  <a
                    href={r.whatsapp_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() =>
                      r.status === "queued" && setStatus.mutate({ ids: r.copies, status: "sent" })
                    }
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[7px] bg-[#25D366] px-3 text-[13px] font-semibold text-white shadow-sm hover:brightness-110"
                  >
                    <MessageCircle className="size-4" fill="currentColor" /> Send
                  </a>
                )}
                {tab === "sent" && <StatusPill status={r.status} />}
              </div>
              {open === r.id && (
                <div className="mt-2 space-y-2">
                  {r.message && (
                    <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-2.5 text-sm">
                      {r.message}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {r.status !== "sent" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10"
                        onClick={() => setStatus.mutate({ ids: r.copies, status: "sent" })}
                      >
                        <Check className="size-3.5 mr-1" /> Already sent
                      </Button>
                    )}
                    {r.status !== "dismissed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-10"
                        onClick={() => setStatus.mutate({ ids: r.copies, status: "dismissed" })}
                      >
                        Skip this one
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ReminderStatus }) {
  const styles: Record<ReminderStatus, string> = {
    queued: "bg-blue-100 text-blue-700",
    sent: "bg-emerald-100 text-emerald-700",
    dismissed: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`rounded-[5px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${styles[status]}`}
    >
      {status}
    </span>
  );
}
