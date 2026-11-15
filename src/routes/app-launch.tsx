import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SplashScreen } from "@/components/ds/SplashScreen";

/**
 * PWA launch target. `start_url` in the tenant manifest points here so the
 * installed app opens straight into the router (never the marketing homepage).
 *
 * Opening the app must feel instant, like Metrol CRM:
 *  - the SAME logo as the boot screen stays up (no second logo, no progress line);
 *  - the place this person went last time is remembered on the phone, so a
 *    signed-in user goes there at once and the check runs in the background;
 *  - the dashboard code starts downloading at the first moment, in parallel.
 * First open on a phone: one database call (my_post_login_route), not three in a row.
 */
export const Route = createFileRoute("/app-launch")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Nevorai Academy" }, { name: "robots", content: "noindex" }],
  }),
  component: AppLaunch,
});

type Target = "/platform-admin" | "/dashboard" | "/student";
const TARGETS: Target[] = ["/platform-admin", "/dashboard", "/student"];
const cacheKey = (uid: string) => `acad.launch.${uid}`;

function readTarget(uid: string): Target | null {
  try {
    const v = window.localStorage.getItem(cacheKey(uid)) as Target | null;
    return v && TARGETS.includes(v) ? v : null;
  } catch {
    return null;
  }
}
function writeTarget(uid: string, t: Target) {
  try {
    window.localStorage.setItem(cacheKey(uid), t);
  } catch {
    /* storage blocked: next open just asks the server again */
  }
}

async function lookupTarget(): Promise<Target> {
  const { data, error } = await supabase.rpc("my_post_login_route" as never);
  if (error) return "/dashboard";
  switch (data as unknown as string) {
    case "platform_admin":
      return "/platform-admin";
    case "staff":
      return "/dashboard";
    default:
      return "/student";
  }
}

function AppLaunch() {
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    // Start fetching the most likely screen's code right away.
    router.preloadRoute({ to: "/dashboard" }).catch(() => {});

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        const uid = data.session?.user?.id;
        if (!uid) {
          navigate({ to: "/auth", replace: true });
          return;
        }

        const known = readTarget(uid);
        if (known) {
          navigate({ to: known, replace: true });
          // Refresh the remembered place for next time (role may have changed).
          lookupTarget()
            .then((t) => writeTarget(uid, t))
            .catch(() => {});
          return;
        }

        const target = await lookupTarget();
        writeTarget(uid, target);
        if (!cancelled) navigate({ to: target, replace: true });
      } catch {
        if (!cancelled) navigate({ to: "/auth", replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, router]);

  // Same screen as the boot splash, so nothing changes on screen while we route.
  return <SplashScreen />;
}
