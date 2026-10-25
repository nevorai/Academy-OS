import { createFileRoute, redirect } from "@tanstack/react-router";

// Profile lives at the foot of the sidebar now (/dashboard/profile): the Match Center no longer carries a "More" tab.
export const Route = createFileRoute("/match-center/profile")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/profile", replace: true });
  },
});
