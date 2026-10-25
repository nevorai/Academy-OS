import { createFileRoute, redirect } from "@tanstack/react-router";

// The match-centre widget editor moved to the platform-admin tenant page.
export const Route = createFileRoute("/match-center/website")({
  beforeLoad: () => {
    throw redirect({ to: "/match-center", replace: true });
  },
});
