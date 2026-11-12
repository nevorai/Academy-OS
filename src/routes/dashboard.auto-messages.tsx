import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCheck,
  ChevronRight,
  LogIn,
  LogOut,
  IndianRupee,
  Megaphone,
  MessageCircle,
  Trophy,
  CalendarCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/lib/dashboard-context";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ModuleHeader } from "@/components/shared/ModuleHeader";

export const Route = createFileRoute("/dashboard/auto-messages")({
  head: () => ({
    meta: [{ title: "Messages to players & parents" }, { name: "robots", content: "noindex" }],
  }),
  component: AutoMessages,
});

type Settings = {
  connected: boolean;
  enabled: boolean;
  checkin: boolean;
  checkout: boolean;
  fee_reminder: boolean;
  fee_received: boolean;
  fee_from_day: number;
  match_result: boolean;
  progress: boolean;
};
type Recent = {
  id: string;
  kind: "checkin" | "checkout" | "fee_due" | "fee_received" | "match_result" | "progress";
  status: "queued" | "sent" | "failed" | "skipped";
  student_name: string | null;
  phone_tail: string;
  error: string | null;
  created_at: string;
};

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc: Rpc = (fn, args) => (supabase.rpc as unknown as Rpc)(fn, args);

const ROWS = [
  {
    key: "checkin",
    icon: LogIn,
    title: "Player arrived",
    hint: "Every saved number gets a message when the player checks in",
  },
  {
    key: "checkout",
    icon: LogOut,
    title: "Player left",
    hint: "Every saved number gets a message when the player checks out",
  },
  {
    key: "fee_reminder",
    icon: IndianRupee,
    title: "Fee reminder",
    hint: "Reminder with your payment QR, sent automatically",
  },
  {
    key: "fee_received",
    icon: CheckCheck,
    title: "Fee received",
    hint: "Receipt message after you record or verify a payment",
  },
  {
    key: "match_result",
    icon: Trophy,
    title: "Match result",
    hint: "When a match ends, parents of the players in it get the result",
  },
  {
    key: "progress",
    icon: CalendarCheck,
    title: "Monthly attendance report",
    hint: "On the 1st, each player's days attended last month",
  },
] as const;

const KIND_WORDS: Record<Recent["kind"], string> = {
  checkin: "Arrived",
  checkout: "Left",
  fee_due: "Fee reminder",
  fee_received: "Fee received",
  match_result: "Match result",
  progress: "Monthly report",
};
const STATUS_WORDS: Record<Recent["status"], string> = {
  queued: "Sending soon",
  sent: "Sent",
  failed: "Could not send",
  skipped: "Not sent",
};

function AutoMessages() {
  const { tenant, profile } = useDashboard();
  const qc = useQueryClient();
  const isOwner = profile.role === "owner";

  const settings = useQuery({
    queryKey: ["parent-msg-settings", tenant.id],
    queryFn: async () => {
      const { data, error } = await rpc("parent_msg_settings", { _tenant: tenant.id });
      if (error) throw new Error(error.message);
      return data as Settings;
    },
  });
  const recent = useQuery({
    queryKey: ["parent-msg-recent", tenant.id],
    enabled: settings.data?.connected === true,
    queryFn: async () => {
      const { data, error } = await rpc("parent_msg_recent", { _tenant: tenant.id });
      if (error) throw new Error(error.message);
      return (data ?? []) as Recent[];
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async (next: Settings) => {
      const { error } = await rpc("parent_msg_save", {
        _tenant: tenant.id,
        _enabled: next.enabled,
        _checkin: next.checkin,
        _checkout: next.checkout,
        _fee_reminder: next.fee_reminder,
        _fee_received: next.fee_received,
        _fee_from_day: next.fee_from_day,
        _match_result: next.match_result,
        _progress: next.progress,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["parent-msg-settings", tenant.id] });
    },
    onError: (e: Error) => {
      toast.error("Could not save. Please try again.");
      if (settings.data) setForm(settings.data);
      console.error(e.message);
    },
  });

  // Optimistic: the switch moves at once, the save follows.
  const change = (patch: Partial<Settings>) => {
    if (!form) return;
    const next = { ...form, ...patch };
    setForm(next);
    save.mutate(next);
  };

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4 px-1 pb-24">
      <ModuleHeader title="Messages to players & parents" overline="WhatsApp" backTo="/dashboard" />

      {settings.isLoading || !form ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : !form.connected ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <MessageCircle className="mb-2 size-7 text-primary" />
          <h2 className="text-lg font-semibold">WhatsApp is not connected yet</h2>
          <p className="mt-1 text-base text-muted-foreground">
            Nevorai will connect your academy's WhatsApp number for you. After that, parents get
            messages by themselves and you only choose which ones. Call or message Nevorai to start.
          </p>
        </section>
      ) : (
        <>
          <section className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
            <div>
              <h2 className="text-lg font-semibold">Send WhatsApp messages</h2>
              <p className="text-base text-muted-foreground">
                {form.enabled ? "ON. Messages go out by themselves." : "OFF. No message will go."}
              </p>
            </div>
            <Switch
              aria-label="Send WhatsApp messages"
              checked={form.enabled}
              disabled={!isOwner || save.isPending}
              onCheckedChange={(v) => change({ enabled: v })}
              className="scale-125"
            />
          </section>

          <section className="divide-y divide-border rounded-xl border border-border bg-card">
            {ROWS.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <r.icon className="size-5" />
                  </span>
                  <div>
                    <div className="text-base font-semibold">{r.title}</div>
                    <div className="text-sm text-muted-foreground">{r.hint}</div>
                  </div>
                </div>
                <Switch
                  aria-label={r.title}
                  checked={form[r.key]}
                  disabled={!isOwner || !form.enabled || save.isPending}
                  onCheckedChange={(v) => change({ [r.key]: v } as Partial<Settings>)}
                  className="scale-110"
                />
              </div>
            ))}
          </section>

          <section className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
            <div>
              <h2 className="text-base font-semibold">Start fee reminders on day</h2>
              <p className="text-sm text-muted-foreground">
                Every morning from this date, until the fee is paid
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Earlier day"
                disabled={!isOwner || !form.enabled || form.fee_from_day <= 1 || save.isPending}
                onClick={() => change({ fee_from_day: form.fee_from_day - 1 })}
                className="grid size-11 place-items-center rounded-lg border border-border text-xl disabled:opacity-40"
              >
                −
              </button>
              <span className="w-10 text-center text-xl font-semibold tabular-nums">
                {form.fee_from_day}
              </span>
              <button
                type="button"
                aria-label="Later day"
                disabled={!isOwner || !form.enabled || form.fee_from_day >= 28 || save.isPending}
                onClick={() => change({ fee_from_day: form.fee_from_day + 1 })}
                className="grid size-11 place-items-center rounded-lg border border-border text-xl disabled:opacity-40"
              >
                +
              </button>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Last messages</h2>
            {recent.isLoading ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : !recent.data?.length ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-base text-muted-foreground">
                Nothing sent yet. Messages will show here.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {recent.data.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium">
                        {KIND_WORDS[m.kind]} · {m.student_name ?? "Player"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Number ending {m.phone_tail}
                        {m.error ? ` · ${m.error}` : ""}
                      </div>
                    </div>
                    <span
                      className={
                        m.status === "sent"
                          ? "shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-medium text-emerald-800"
                          : m.status === "failed"
                            ? "shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-sm font-medium text-red-800"
                            : "shrink-0 rounded-full bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground"
                      }
                    >
                      {STATUS_WORDS[m.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Link
        to="/dashboard/communications"
        className="flex items-center justify-between rounded-xl border border-border bg-card p-4 active:scale-[0.99]"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="size-5" />
          </span>
          <span>
            <span className="block text-base font-semibold">Send one message to everyone</span>
            <span className="block text-sm text-muted-foreground">
              Holiday, match day, new batch
            </span>
          </span>
        </span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>
    </div>
  );
}
