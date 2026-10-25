import { createFileRoute, redirect } from "@tanstack/react-router";

// The public-website editor moved to the platform-admin tenant page (Site content): the academy owner no longer edits it.
export const Route = createFileRoute("/dashboard/site")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
