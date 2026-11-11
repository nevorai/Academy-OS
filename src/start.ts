import { createStart, createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Baseline security headers applied to every server response.
 *
 * CSP is ENFORCED (2026-11-11). Inline scripts/styles stay allowed because the SSR
 * bootstrap needs them; the rest is an allow-list of the hosts the browser really talks to
 * (Supabase, Razorpay checkout, YouTube, Google Maps, Google Fonts, the media CDN).
 * Add a host here when a new browser-side integration is added, or it will be blocked.
 */
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const response = await next();
  try {
    setResponseHeader("X-Frame-Options", "DENY");
    setResponseHeader("X-Content-Type-Options", "nosniff");
    setResponseHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    setResponseHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    // QR attendance needs the camera + GPS on our own origin.
    setResponseHeader("Permissions-Policy", "geolocation=(self), microphone=(), camera=(self)");
    setResponseHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.lovable.app https://*.lovable.dev",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: https:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.razorpay.com https://lumberjack.razorpay.com https://*.lovable.app https://*.lovable.dev",
        "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com https://api.razorpay.com https://checkout.razorpay.com",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );
  } catch {
    // setResponseHeader requires an active request scope; ignore otherwise.
  }
  return response;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware],
}));
