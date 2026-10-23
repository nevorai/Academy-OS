import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/kaizen/provision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleKaizen } = await import("@/lib/kaizen-route.server");
        return handleKaizen(request, "provision");
      },
    },
  },
});
