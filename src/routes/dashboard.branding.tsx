import { createFileRoute, redirect } from "@tanstack/react-router";

// Logo, brand colour and the public site are edited by Nevorai on the platform-admin tenant page; the owner has no
// branding screen, so this old stub just goes home.
export const Route = createFileRoute("/dashboard/branding")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
  head: () => ({
    meta: [{ title: "Branding · Academy" }, { name: "robots", content: "noindex" }],
  }),
  component: () => null,
});
