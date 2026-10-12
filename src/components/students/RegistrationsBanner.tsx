import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Inbox, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * "N pending registrations" strip above the players list. It counts new
 * admission requests and new enquiries together, in the database (two head
 * counts in one round trip, no rows downloaded).
 *
 * Dismissing it remembers the number seen, in this browser, so the strip
 * stays away until a newer request arrives.
 */
export function RegistrationsBanner({ tenantId }: { tenantId: string }) {
  const pending = useQuery({
    queryKey: ["d", "regs-plus-leads-count", tenantId],
    queryFn: async () => {
      const [regs, leads] = await Promise.all([
        supabase
          .from("registrations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "new"),
        supabase
          .from("leads" as never)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "new"),
      ]);
      return (regs.count ?? 0) + (leads.count ?? 0);
    },
    refetchInterval: 30_000,
  });

  const dismissKey = `regs-banner-ack:${tenantId}`;
  const [ackCount, setAckCount] = useState(0);
  useEffect(() => {
    try {
      const n = Number(window.localStorage.getItem(dismissKey) ?? 0);
      setAckCount(Number.isFinite(n) ? n : 0);
    } catch {
      setAckCount(0); // private window or storage blocked: just show the strip
    }
  }, [dismissKey]);

  const count = pending.data ?? 0;
  if (count <= ackCount) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(dismissKey, String(count));
    } catch {
      /* not remembered across reloads, still hidden for now */
    }
    setAckCount(count);
  };

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3">
      <Link
        to="/dashboard/registrations"
        onClick={dismiss}
        className="flex items-center gap-3 min-w-0 flex-1"
      >
        <span className="grid place-items-center size-9 rounded-full bg-rose-600 text-white shrink-0">
          <Inbox className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {count} pending registration{count === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-muted-foreground">
            New admission requests waiting for review
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="grid place-items-center size-8 rounded-full text-muted-foreground hover:bg-rose-500/10 hover:text-foreground shrink-0"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
