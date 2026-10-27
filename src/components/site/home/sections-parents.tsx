/**
 * Home page: everything a parent asks before joining, in one place. Every figure comes from the academy's own
 * data (batches, fees, coach, results, address). The only standard wording is "what to bring" and the join steps.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Backpack,
  Clock,
  IndianRupee,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import type { Tenant } from "@/lib/tenant";
import { oneLineAddress } from "@/lib/public-site";
import { PACKS } from "./copy";
import { rupees, type HomeModel, type Pack } from "./model";
import { BTN, BTN_GHOST_LIGHT, SectionHead, WRAP } from "./sections-top";

const BTN_NIGHT = `${BTN} bg-[#0A0F1A] text-white hover:brightness-125`;

const waNumber = (n?: string | null) => n?.replace(/[^\d]/g, "") || "";

const HEAD: Record<Pack, { label: string; title: string; lead: string }> = {
  cricket: {
    label: "For parents",
    title: "Everything parents ask, in one place",
    lead: "Ages, timings, fees, who teaches and what to bring. Nothing hidden.",
  },
  gym: {
    label: "Before you join",
    title: "Everything you need to know",
    lead: "Timings, fees, who trains you and what to bring.",
  },
  learning: {
    label: "For parents",
    title: "Everything parents ask, in one place",
    lead: "Timings, fees, who teaches and what to bring.",
  },
};

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-xl border border-[#0A0F1A]/10 bg-[#F4F1E9] p-6">
      <div className="grid h-11 w-11 place-items-center rounded-[10px] bg-[#0A0F1A] text-[var(--pub-hot)]">
        {icon}
      </div>
      <h3 className="mt-4 font-[family-name:var(--font-display)] text-lg font-bold">{title}</h3>
      <div className="mt-2 text-[15px] leading-relaxed text-[#0A0F1A]/75">{children}</div>
    </article>
  );
}

const STEPS = [
  ["Register online", "Fill in the short form. It takes a few minutes."],
  ["The academy confirms", "They check the details and confirm your batch."],
  ["Start training", "Come to your first session and meet your coach."],
] as const;

export function Parents({ tenant, m }: { tenant: Tenant; m: HomeModel }) {
  const head = HEAD[m.pack];
  const phone = tenant.phone?.trim();
  const wa = waNumber(tenant.whatsapp ?? tenant.phone);
  const address = oneLineAddress(tenant.address);
  const monthlyFrom = m.monthly.length ? Math.min(...m.monthly.map((f) => f.amount)) : null;
  const credentials = (m.founder?.credentials ?? "")
    .split(/[\n,;•]+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <section className="bg-white py-16 text-[#0A0F1A] sm:py-24" id="parents">
      <div className={WRAP}>
        <SectionHead n={3} label={head.label} title={head.title} lead={head.lead} />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {m.ages ? (
            <InfoCard icon={<Users className="h-5 w-5" />} title="Ages">
              <p>Players aged {m.ages} train here.</p>
            </InfoCard>
          ) : null}

          {m.batches.length ? (
            <InfoCard icon={<Clock className="h-5 w-5" />} title="Timings">
              <ul className="space-y-1.5">
                {m.batches.slice(0, 4).map((b) => (
                  <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold text-[#0A0F1A]">{b.name}</span>
                    {b.timing ? <span className="tabular-nums">{b.timing}</span> : null}
                  </li>
                ))}
              </ul>
              <p className="mt-3">Pick the batch that fits school and home.</p>
            </InfoCard>
          ) : null}

          <InfoCard icon={<IndianRupee className="h-5 w-5" />} title="Fees">
            {m.showPricing && monthlyFrom != null ? (
              <>
                <p>
                  <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#0A0F1A]">
                    From {rupees(monthlyFrom)}
                  </span>{" "}
                  a month
                </p>
                {m.registration ? (
                  <p className="mt-1">
                    Plus {rupees(m.registration.amount)} one-time registration.
                  </p>
                ) : null}
              </>
            ) : (
              <p>
                The fee depends on the batch. {phone ? `Call ${phone}` : "Get in touch"} and the
                academy will tell you the exact amount.
              </p>
            )}
          </InfoCard>

          {m.founder ? (
            <InfoCard icon={<ShieldCheck className="h-5 w-5" />} title="Who teaches">
              <p className="font-semibold text-[#0A0F1A]">
                {m.founder.name}
                {m.founder.title ? `, ${m.founder.title}` : ""}
              </p>
              {credentials.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {credentials.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}
              <a href="#coach" className="mt-3 inline-block font-semibold text-[var(--brand)]">
                Meet the coach
              </a>
            </InfoCard>
          ) : null}

          <InfoCard icon={<Backpack className="h-5 w-5" />} title="What to bring">
            <p>{PACKS[m.pack].bring}</p>
          </InfoCard>

          {m.facts.length ? (
            <InfoCard icon={<Trophy className="h-5 w-5" />} title="Results">
              <ul className="space-y-1.5">
                {m.facts.slice(0, 3).map((f) => (
                  <li key={f.label}>
                    {f.figure ? <b className="text-[#0A0F1A]">{f.figure} </b> : null}
                    {f.label}
                  </li>
                ))}
              </ul>
            </InfoCard>
          ) : null}

          {address ? (
            <InfoCard icon={<MapPin className="h-5 w-5" />} title="Where">
              <p>{address}</p>
              {m.map.linkUrl ? (
                <a
                  href={m.map.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block font-semibold text-[var(--brand)]"
                >
                  Get directions
                </a>
              ) : null}
            </InfoCard>
          ) : null}
        </div>

        <ol className="mt-10 grid gap-5 sm:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="flex items-start gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0A0F1A] font-[family-name:var(--font-display)] text-sm font-bold text-[var(--pub-hot)]">
                {i + 1}
              </span>
              <span>
                <span className="block font-[family-name:var(--font-display)] text-lg font-bold">
                  {t}
                </span>
                <span className="mt-0.5 block text-[15px] leading-snug text-[#0A0F1A]/70">{d}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/register" className={BTN_NIGHT}>
            {m.hero.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
          {phone ? (
            <a href={`tel:${phone}`} className={BTN_GHOST_LIGHT}>
              <Phone className="h-4 w-4" />
              Call {phone}
            </a>
          ) : null}
          {wa ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className={BTN_GHOST_LIGHT}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          ) : null}
          <a href="#faq" className={BTN_GHOST_LIGHT}>
            More questions
          </a>
        </div>
      </div>
    </section>
  );
}
