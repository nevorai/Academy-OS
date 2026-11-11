import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/lib/cron-auth.server";

/**
 * POST /api/public/hooks/parent-messages  (pg_cron, every 15 minutes)
 * Turns new check-ins, check-outs, fee reminders and received payments into WhatsApp messages to parents
 * through Nevorai Connect, then sends them. Bounded: 100 sends per academy per run. Safe to repeat.
 */
export const Route = createFileRoute("/api/public/hooks/parent-messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireCronAuth(request);
        if (unauthorized) return unauthorized;
        const [{ supabaseAdmin }, { runParentMessages }] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/parent-messages.server"),
        ]);
        const summary = await runParentMessages(supabaseAdmin as never);
        return Response.json({ ok: true, ...summary });
      },
    },
  },
});
