import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type EventRow = Database["public"]["Tables"]["automation_events"]["Insert"];

/**
 * Best-effort write to the automation event log. The main save has already succeeded when this runs, so a
 * failure never reaches the user, but it is logged (it used to vanish) so a broken log can be noticed.
 */
export async function logAutomationEvent(
  client: Pick<SupabaseClient<Database>, "from">,
  rows: EventRow | EventRow[],
): Promise<void> {
  try {
    const { error } = await client.from("automation_events").insert(rows as never);
    if (error) console.error("[automation_events] insert failed:", error.message);
  } catch (e) {
    console.error("[automation_events] insert threw:", e instanceof Error ? e.message : e);
  }
}
