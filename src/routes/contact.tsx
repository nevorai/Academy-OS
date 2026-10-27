import { createFileRoute } from "@tanstack/react-router";
import { isPlatformRequest, seo } from "@/lib/seo";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  ExternalLink,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { TenantGate } from "@/components/site/TenantGate";
import { PageHero } from "@/components/site/PageHero";
import {
  BTN_NIGHT,
  Band,
  BandHead,
  CARD_CREAM,
  FIELD,
  IconTile,
  InnerPage,
} from "@/components/site/inner-ui";
import { BTN_GHOST_DARK, BTN_HOT } from "@/components/site/home/sections-top";
import { buildHomeModel } from "@/components/site/home/model";
import { oneLineAddress } from "@/lib/public-site";
import { siteContentQuery } from "@/lib/site-queries";
import { useTenant } from "@/lib/tenant-context";
import { useSiteBundle } from "@/lib/use-site-bundle";
import { supabase } from "@/integrations/supabase/client";
import { checkRateLimit } from "@/lib/bulk-ops";

export const Route = createFileRoute("/contact")({
  head: () =>
    seo({
      title: "Contact the Academy — Call, WhatsApp & Ground Location",
      description:
        "Get in touch with the academy — phone, WhatsApp, email and ground location. We usually reply the same day.",
      path: "/contact",
      index: !isPlatformRequest(),
    }),
  component: () => (
    <TenantGate>
      <ContactContent />
    </TenantGate>
  ),
});

const CONTACT_CARD = `${CARD_CREAM} group flex flex-col transition-colors hover:border-[#0A0F1A]/40`;
const CONTACT_LABEL =
  "mt-5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#0A0F1A]/55";
const CONTACT_GO =
  "mt-auto pt-6 text-sm font-bold text-[#0A0F1A] underline decoration-[var(--pub-hot)] decoration-2 underline-offset-4";
const CONTACT_VALUE =
  "mt-1 break-words font-[family-name:var(--font-display)] text-lg font-bold leading-snug";

function ContactContent() {
  const tenant = useTenant();
  const site = useSiteBundle();
  const { data: sections = [] } = useQuery({
    ...siteContentQuery(tenant.id),
    initialData: site?.siteContent ?? undefined,
  });
  const wa = (tenant.whatsapp ?? tenant.phone)?.replace(/[^\d]/g, "");
  const address = tenant.address ? oneLineAddress(tenant.address) : null;
  const { map } = buildHomeModel({ tenant, sections, fees: [], batches: [] });

  return (
    <InnerPage>
      <PageHero
        pageKey="contact"
        eyebrow="Get in touch"
        title="Contact us"
        subtitle="Have questions? Reach out — we usually reply the same day."
      />
      <Band tone="white">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tenant.phone ? (
            <a href={`tel:${tenant.phone}`} className={CONTACT_CARD}>
              <IconTile>
                <Phone className="h-5 w-5" />
              </IconTile>
              <div className={CONTACT_LABEL}>Call</div>
              <div className={CONTACT_VALUE}>{tenant.phone}</div>
              <div className={CONTACT_GO}>Call now →</div>
            </a>
          ) : null}

          {wa ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className={CONTACT_CARD}
            >
              <IconTile>
                <MessageCircle className="h-5 w-5" />
              </IconTile>
              <div className={CONTACT_LABEL}>WhatsApp</div>
              <div className={CONTACT_VALUE}>Chat with us</div>
              <div className={CONTACT_GO}>Open WhatsApp →</div>
            </a>
          ) : null}

          {tenant.email ? (
            <a href={`mailto:${tenant.email}`} className={CONTACT_CARD}>
              <IconTile>
                <Mail className="h-5 w-5" />
              </IconTile>
              <div className={CONTACT_LABEL}>Email</div>
              <div className={`${CONTACT_VALUE} break-all`}>{tenant.email}</div>
              <div className={CONTACT_GO}>Send an email →</div>
            </a>
          ) : null}

          {map.linkUrl && address ? (
            <a href={map.linkUrl} target="_blank" rel="noreferrer" className={CONTACT_CARD}>
              <IconTile>
                <MapPin className="h-5 w-5" />
              </IconTile>
              <div className={CONTACT_LABEL}>
                Visit <ExternalLink className="h-3 w-3" />
              </div>
              <div className={CONTACT_VALUE}>{address}</div>
              <div className={CONTACT_GO}>Open in Maps →</div>
            </a>
          ) : null}
        </div>

        <EnquiryForm tenantId={tenant.id} tenantName={tenant.name} />
      </Band>

      {map.embedUrl ? (
        <Band tone="night">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center">
            <div>
              <BandHead
                n={2}
                label="Find us"
                title="Come and see the ground"
                lead={address ?? undefined}
                tone="night"
              />
              <div className="mt-8 flex flex-wrap gap-3">
                {map.linkUrl ? (
                  <a href={map.linkUrl} target="_blank" rel="noreferrer" className={BTN_HOT}>
                    <MapPin className="h-4 w-4" />
                    Get directions
                  </a>
                ) : null}
                {map.shareUrl ? (
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${tenant.name}\n${address ?? ""}\n${map.shareUrl}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={BTN_GHOST_DARK}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Share location
                  </a>
                ) : null}
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
              <iframe
                title={`Map to ${tenant.name}`}
                src={map.embedUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="block h-[320px] w-full border-0 lg:h-[400px]"
              />
            </div>
          </div>
        </Band>
      ) : null}
    </InnerPage>
  );
}

function EnquiryForm({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Name and phone are required.");
      return;
    }
    setSaving(true);
    // Phase 3 — client-side rate limit gate. Prevents accidental double-submits
    // and drive-by spam on the public contact form.
    const rlKey = `contact-form:${tenantId}:${phone.trim()}`;
    const allowed = await checkRateLimit(rlKey, 3, 300);
    if (!allowed) {
      setSaving(false);
      toast.error("Too many attempts. Please try again in a few minutes.");
      return;
    }
    const { error } = await supabase.rpc(
      "submit_lead" as never,
      {
        _tenant_id: tenantId,
        _name: name.trim(),
        _phone: phone.trim(),
        _message: message.trim() || null,
        _source: "site-contact",
      } as never,
    );
    setSaving(false);
    if (error) {
      toast.error(error.message ?? "Could not send. Please try again.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className={`${CARD_CREAM} mt-14 flex flex-col items-center !p-10 text-center`}>
        <IconTile>
          <CheckCircle2 className="h-5 w-5" />
        </IconTile>
        <h2 className="mt-5 font-[family-name:var(--font-display)] text-2xl font-extrabold">
          Thanks — message received
        </h2>
        <p className="mt-2 text-[15px] text-[#0A0F1A]/70">
          {tenantName} will get back to you shortly, usually on WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-14">
      <BandHead
        n={1}
        label="Send a message"
        title="Or leave your number and we will reach out"
        lead="Tell us what you are looking for. The academy will call or message you."
      />
      <form onSubmit={onSubmit} className={`${CARD_CREAM} space-y-4 sm:!p-8`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0A0F1A]/60">
              Your name *
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0A0F1A]/60">
              Phone *
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              className={FIELD}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-[#0A0F1A]/60">
            What can we help with?
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="e.g. Looking for morning batches for my 12-year-old."
            className={FIELD}
          />
        </label>
        <button type="submit" disabled={saving} className={BTN_NIGHT}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Send message
        </button>
      </form>
    </div>
  );
}
