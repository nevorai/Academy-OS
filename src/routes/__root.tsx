import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { TenantProvider } from "../lib/tenant-context";
import { ImpersonationBanner } from "../components/platform/ImpersonationBanner";
import { PLATFORM_OG_IMAGE } from "../lib/seo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error: rawError, reset }: ErrorComponentProps) {
  const error = rawError instanceof Error ? rawError : new Error(String(rawError));
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  // Show the underlying error in development so the crash is diagnosable
  // instead of a generic "this page didn't load" screen.
  const isDev =
    typeof import.meta !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {isDev ? (
          <pre className="mt-4 max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-left text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
            {error?.message || String(error)}
            {error?.stack ? `\n\n${error.stack}` : ""}
          </pre>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // viewport-fit=cover → respects notch/Dynamic Island safe areas.
      // maximum-scale=1 + user-scalable=no → disables pinch-zoom & double-tap zoom
      // so the installed app doesn't feel like a website. Inputs are already 16px+
      // so iOS won't auto-zoom on focus.
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, shrink-to-fit=no, interactive-widget=resizes-content",
      },
      // Site-wide fallbacks. Every marketing route overrides these via `seo()`;
      // tenant sites get their academy's own title/description patched in by
      // TenantProvider. These only show on routes that set no head of their own.
      { title: "Nevorai Academy — Cricket Academy Management Software" },
      {
        name: "description",
        content:
          "Cricket academy management software for Indian academies — admissions, fees, attendance, live match scoring and your own academy website.",
      },
      { name: "author", content: "Nevorai" },
      // PWA / standalone app hints so installed app launches without browser chrome.
      { name: "theme-color", content: "#f5f5f5" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Nevorai Academy" },
      { name: "application-name", content: "Nevorai Academy" },
      { name: "format-detection", content: "telephone=no" },
      { property: "og:site_name", content: "Nevorai Academy" },
      { property: "og:locale", content: "en_IN" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Nevorai Academy" },
      {
        property: "og:description",
        content:
          "Cricket academy management software for Indian academies — admissions, fees, attendance, live match scoring and your own academy website.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Nevorai Academy" },
      {
        name: "twitter:description",
        content:
          "Cricket academy management software for Indian academies — admissions, fees, attendance, live match scoring and your own academy website.",
      },
      { property: "og:image", content: PLATFORM_OG_IMAGE },
      { name: "twitter:image", content: PLATFORM_OG_IMAGE },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Per-tenant favicon: `/api/public/tenant-icon` resolves the tenant from
      // the request Host header and returns that academy's logo (falls back to
      // the default only when the tenant has no logo). Custom domains like
      // `saisportsacademy.nevorai.com` show the academy's own mark in the
      // browser tab, home-screen and social previews — without waiting for
      // client JS to swap the link.
      { rel: "icon", href: "/api/public/tenant-icon", type: "image/png" },
      { rel: "apple-touch-icon", href: "/api/public/tenant-icon" },
      // Default (platform) manifest — the tenant provider swaps in a per-tenant
      // manifest once the tenant is resolved so each academy installs with its
      // own name/icon/colors.
      { rel: "manifest", href: "/api/public/manifest/webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Inter:wght@300;400;500;600;700;900&family=IBM+Plex+Sans:wght@400;500;600;700&family=Archivo:wght@500;600;700;800&display=swap",
      },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  pendingComponent: AppSplash,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function AppSplash() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-background text-foreground animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-6">
        <div
          className="grid h-20 w-20 place-items-center rounded-3xl text-4xl"
          style={{ backgroundColor: "transparent" }}
        >
          <img
            src="/api/public/tenant-icon"
            alt=""
            className="size-20 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              if (e.currentTarget.parentElement) e.currentTarget.parentElement.innerText = "🏏";
            }}
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full origin-left animate-progress bg-primary" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-semibold">
            Nevorai Academy
          </p>
        </div>
      </div>
    </div>
  );
}

function RootShell({ children }: { children: ReactNode }) {
  // Pre-hydration theme boot — supports "light" | "dark" | "system" (default: light).
  // Self-heal for a stale page: if a /assets/ script or stylesheet of this page fails to load
  // (the page came from a cache made before a deploy), clear every cache, unregister the
  // service worker and load the page again, once per tab session. Runs before anything else.
  const shellHeal = `(function(){var K='acad.shell-heal',f=false;function heal(){if(f)return;f=true;try{if(sessionStorage.getItem(K))return;sessionStorage.setItem(K,'1')}catch(e){return}var p=[];try{if(window.caches)p.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))}))}catch(e){}try{if(navigator.serviceWorker)p.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister()}))}))}catch(e){}function go(){location.reload()}Promise.all(p).then(go,go)}window.addEventListener('error',function(e){var t=e&&e.target;if(!t||t===window)return;var u=(t.tagName==='SCRIPT'&&t.src)||(t.tagName==='LINK'&&t.href)||'';if(typeof u==='string'&&u.indexOf('/assets/')!==-1&&u.indexOf(location.host)!==-1)heal()},true);window.addEventListener('load',function(){if(!f)try{sessionStorage.removeItem(K)}catch(e){}})})();`;
  const themeBoot = `try{var t=localStorage.getItem('acadaos.theme');if(t!=='light'&&t!=='dark'&&t!=='system'){t='light';}var d=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){document.documentElement.classList.remove('dark');}`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: shellHeal }} />
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Toasts follow the page theme (the `dark` class on <html>), not the phone's setting. */
function useToastTheme(): "light" | "dark" {
  const [t, setT] = useState<"light" | "dark">("light");
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setT(el.classList.contains("dark") ? "dark" : "light");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return t;
}

function ThemeSystemListener() {
  // Keeps the resolved theme in sync with the OS when the user's stored mode is "system".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      let mode: string | null = null;
      try {
        mode = localStorage.getItem("acadaos.theme");
      } catch {
        /* ignore */
      }
      if (mode !== "system") return;
      const dark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      const el = document.documentElement;
      if (dark) el.classList.add("dark");
      else el.classList.remove("dark");
    };
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", apply);
    return () => mq?.removeEventListener?.("change", apply);
  }, []);
  return null;
}

function PwaBootstrap() {
  // Registers the service worker (guarded — never runs in Lovable preview,
  // dev, iframes, or when `?sw=off` is present) and captures the browser's
  // install prompt so the parent portal can offer a "Install Nevorai Academy" CTA.
  useEffect(() => {
    if (typeof window === "undefined") return;
    void (async () => {
      const [{ registerPwa }, { captureInstallPrompt }] = await Promise.all([
        import("@/lib/pwa/register"),
        import("@/lib/pwa/install-prompt"),
      ]);
      captureInstallPrompt();
      await registerPwa();
    })();
  }, []);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const toastTheme = useToastTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <ThemeSystemListener />
        <PwaBootstrap />
        <ImpersonationBanner />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        {/* App-wide toast host — without this, every toast.success/error is invisible,
            making uploads and form validation look like "nothing happened". */}
        <Toaster
          richColors
          position="top-center"
          theme={toastTheme}
          offset="calc(var(--app-safe-top) + 3.25rem)"
          toastOptions={{ className: "scorer-safe-toast" }}
        />
      </TenantProvider>
    </QueryClientProvider>
  );
}
