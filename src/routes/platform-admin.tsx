import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PlatformProvider } from "@/lib/platform-context";
import { PlatformShell } from "@/components/platform/PlatformShell";

export const Route = createFileRoute("/platform-admin")({
  head: () => ({
    meta: [{ title: "Platform Admin · Nevorai Academy" }, { name: "robots", content: "noindex" }],
  }),
  component: Layout,
});

function Layout() {
  return (
    <PlatformProvider>
      <PlatformShell>
        <Outlet />
      </PlatformShell>
    </PlatformProvider>
  );
}
