import { Link } from "@tanstack/react-router";
import { Phone, MessageCircle, Mail, MapPin } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { getFeatures } from "@/lib/tenant";
import { packFor } from "./home/model";

function waLink(number?: string | null) {
  if (!number) return null;
  const clean = number.replace(/[^\d]/g, "");
  return clean ? `https://wa.me/${clean}` : null;
}

const footerNav = [
  { to: "/about", label: "About" },
  { to: "/programs", label: "Programs" },
  { to: "/coaches", label: "Coaches" },
  { to: "/star-players", label: "Star Players" },
  { to: "/achievements", label: "Achievements" },
  { to: "/matches", label: "Matches" },
  { to: "/gallery", label: "Gallery" },
  { to: "/fees", label: "Fees" },
  { to: "/admissions", label: "Admissions" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteFooter() {
  const tenant = useTenant();
  const features = getFeatures(tenant);
  const wa = waLink(tenant.whatsapp ?? tenant.phone);

  return (
    <footer
      data-pack={packFor(tenant.niche)}
      className="mt-16 border-t border-white/10 bg-[#070B14] text-white"
    >
      <div className="mx-auto grid w-[min(1320px,94%)] gap-8 py-12 md:grid-cols-4">
        <div>
          <div className="text-base font-semibold text-white">{tenant.name}</div>
          {tenant.tagline ? <p className="mt-2 text-sm text-white/55">{tenant.tagline}</p> : null}
        </div>

        <div className="space-y-2 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/55">
            Explore
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {footerNav.map((n) => (
              <Link key={n.to} to={n.to} className="py-1.5 text-white/80 hover:text-white">
                {n.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/55">
            Contact
          </div>
          {tenant.phone ? (
            <a
              href={`tel:${tenant.phone}`}
              className="flex items-center gap-2 text-white hover:opacity-80"
            >
              <Phone className="h-4 w-4" style={{ color: "var(--pub-hot)" }} />
              {tenant.phone}
            </a>
          ) : null}
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-white hover:opacity-80"
            >
              <MessageCircle className="h-4 w-4" style={{ color: "var(--pub-hot)" }} />
              WhatsApp
            </a>
          ) : null}
          {tenant.email ? (
            <a
              href={`mailto:${tenant.email}`}
              className="flex items-center gap-2 text-white hover:opacity-80"
            >
              <Mail className="h-4 w-4" style={{ color: "var(--pub-hot)" }} />
              {tenant.email}
            </a>
          ) : null}
        </div>

        {tenant.address ? (
          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/55">
              Visit us
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 text-white hover:opacity-80"
            >
              <MapPin
                className="mt-0.5 h-4 w-4 flex-shrink-0"
                style={{ color: "var(--pub-hot)" }}
              />
              <span>{tenant.address}</span>
            </a>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-[min(1320px,94%)] flex-col items-center justify-between gap-2 py-4 text-xs text-white/55 sm:flex-row">
          <div>
            © {new Date().getFullYear()} {tenant.name}. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/policies/$kind"
              params={{ kind: "terms" }}
              className="text-white/55 hover:text-white"
            >
              Terms &amp; Conditions
            </Link>
            <Link
              to="/policies/$kind"
              params={{ kind: "privacy" }}
              className="text-white/55 hover:text-white"
            >
              Privacy
            </Link>
            <Link to="/auth" className="text-white/55 hover:text-white">
              Owner login
            </Link>
            {features.powered_by_badge !== false ? (
              <div>
                Powered by <span className="font-semibold text-white">Nevorai Academy</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
