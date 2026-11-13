import { createFileRoute } from "@tanstack/react-router";
import { SessionFeesPanel } from "@/components/fees/SessionFeesPanel";

/**
 * Sessions are the single source of truth for training groups AND their fees —
 * the same panel is what the Fees hub renders under its "Sessions & Fees" tab.
 */
export const Route = createFileRoute("/dashboard/batches")({
  head: () => ({
    meta: [
      { title: "Sessions & fees · Academy dashboard" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BatchesPage,
});

function BatchesPage() {
  return (
    <div className="space-y-4">
      {/* The panel below carries the visible heading; a second one only pushed the list down. */}
      <h1 className="sr-only">Sessions</h1>
      <SessionFeesPanel />
    </div>
  );
}
