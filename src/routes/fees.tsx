import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles, MessageCircle, CalendarClock } from "lucide-react";
import { TenantGate } from "@/components/site/TenantGate";
import { PageHero } from "@/components/site/PageHero";
import {
  BTN_NIGHT,
  Band,
  BandHead,
  CARD_CREAM,
  EmptyNote,
  IconTile,
  InnerPage,
  JoinBand,
} from "@/components/site/inner-ui";
import { BTN, BTN_GHOST_LIGHT } from "@/components/site/home/sections-top";
import { cleanBatchName } from "@/components/site/home/model";
import { useTenant } from "@/lib/tenant-context";
import { useSiteBundle } from "@/lib/use-site-bundle";
import { feePlansQuery, siteContentQuery, sectionOne } from "@/lib/site-queries";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/fees")({
  head: () => ({
    meta: [
      { title: "Fees & plans" },
      {
        name: "description",
        content: "Transparent monthly plans and one-time fees paid directly to the academy.",
      },
      { property: "og:title", content: "Fees & plans" },
      {
        property: "og:description",
        content: "Transparent monthly plans and one-time fees paid directly to the academy.",
      },
    ],
  }),
  component: () => (
    <TenantGate>
      <FeesContent />
    </TenantGate>
  ),
});

type FeesMode = "show" | "hide" | "contact" | "demo";

function FeesContent() {
  const tenant = useTenant();
  const site = useSiteBundle();
  const { data: fees = [], isLoading } = useQuery({
    ...feePlansQuery(tenant.id),
    initialData: site?.feePlans ?? undefined,
  });
  const { data: sections = [] } = useQuery({
    ...siteContentQuery(tenant.id),
    initialData: site?.siteContent ?? undefined,
  });
  const pricing = sectionOne<{ mode?: FeesMode; visible?: string }>(sections, "pricing");
  const mode: FeesMode = pricing?.mode ?? (pricing?.visible === "false" ? "hide" : "show");

  if (mode !== "show") return <FeesCtaOnly tenant={tenant} mode={mode} />;

  const registration = fees.filter((f) => f.type === "registration");
  const monthly = fees.filter((f) => f.type === "monthly");
  const sortedMonthly = [...monthly].sort((a, b) => a.amount - b.amount);
  const popularId =
    sortedMonthly.length >= 2 ? sortedMonthly[Math.floor(sortedMonthly.length / 2)]?.id : undefined;

  return (
    <InnerPage>
      <PageHero
        pageKey="fees"
        eyebrow="Simple, transparent pricing"
        title="Fees & plans"
        subtitle={`Pay directly to ${tenant.name} via UPI. No hidden fees, no card surcharges.`}
      />
      <Band tone="white">
        <div className={`${CARD_CREAM} flex flex-wrap items-center justify-between gap-3 !p-5`}>
          <div className="text-[15px] text-[#0A0F1A]/75">
            Ready to join? Start an admission request in a few minutes.
          </div>
          <Link
            to="/admissions"
            className="inline-flex items-center gap-1 font-bold text-[#0A0F1A] underline decoration-[var(--pub-hot)] decoration-2 underline-offset-4"
          >
            Start admissions →
          </Link>
        </div>

        {isLoading ? (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {monthly.length > 0 ? (
              <section className="mt-12">
                <BandHead n={1} label="Pay monthly" title="Monthly plans" />
                <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedMonthly.map((p) => (
                    <PlanCard
                      key={p.id}
                      name={p.name}
                      amount={p.amount}
                      period="per month"
                      desc={p.description}
                      popular={p.id === popularId && sortedMonthly.length >= 2}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {registration.length > 0 ? (
              <section className="mt-16">
                <BandHead n={2} label="Pay once" title="One-time fees" />
                <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {registration.map((p) => (
                    <PlanCard
                      key={p.id}
                      name={p.name}
                      amount={p.amount}
                      period="one-time"
                      desc={p.description}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {fees.length === 0 ? (
              <div className="mt-12">
                <EmptyNote>Fee plans coming soon.</EmptyNote>
              </div>
            ) : null}
          </>
        )}
      </Band>

      <JoinBand text={`Register online and pay directly to ${tenant.name} via UPI.`} />
    </InnerPage>
  );
}

function FeesCtaOnly({ tenant, mode }: { tenant: ReturnType<typeof useTenant>; mode: FeesMode }) {
  if (mode === "hide") {
    return (
      <InnerPage>
        <PageHero
          pageKey="fees"
          eyebrow="Fees"
          title="Fees & plans"
          subtitle="Please register or contact us to know more about our plans."
        />
        <JoinBand text="Register online, or contact the academy to ask about plans." />
      </InnerPage>
    );
  }
  const wa = (tenant.whatsapp ?? tenant.phone ?? "").replace(/[^\d]/g, "");
  const waMsg = encodeURIComponent(
    `Hi ${tenant.name}, I'd like to know more about your ${mode === "demo" ? "trial / demo session" : "fees & plans"}.`,
  );
  const waHref = wa ? `https://wa.me/${wa}?text=${waMsg}` : null;
  const isDemo = mode === "demo";
  return (
    <InnerPage>
      <PageHero
        pageKey="fees"
        eyebrow={isDemo ? "Try before you join" : "Get in touch"}
        title={isDemo ? "Book a free demo" : "Chat with us about fees"}
        subtitle={
          isDemo
            ? `Come try a session at ${tenant.name}. We'll walk you through plans in person.`
            : `Reach out to ${tenant.name} — we'll share plans that suit your child.`
        }
      />
      <Band tone="white" className="min-h-[30vh]">
        <div
          className={`${CARD_CREAM} flex flex-col gap-6 !p-7 sm:!p-9 lg:flex-row lg:items-center`}
        >
          <IconTile>
            {isDemo ? <CalendarClock className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          </IconTile>
          <div className="min-w-0 lg:max-w-md">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold leading-tight">
              {isDemo ? "Try a session first" : "Talk to the academy"}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[#0A0F1A]/70">
              {isDemo
                ? "Send a message and the academy will confirm a time for you."
                : "Message or call, and the academy will share the plans that suit you."}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:ml-auto">
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className={`${BTN} w-full bg-[#25D366] text-white hover:brightness-105 sm:w-auto`}
              >
                <MessageCircle className="h-4 w-4" fill="currentColor" />
                {isDemo ? "Book on WhatsApp" : "Message us on WhatsApp"}
              </a>
            ) : null}
            <Link to="/contact" className={`${BTN_GHOST_LIGHT} w-full sm:w-auto`}>
              Contact us
            </Link>
            <Link to="/register" className={`${BTN_NIGHT} w-full sm:w-auto`}>
              {isDemo ? "Register for a trial" : "Register Now"}
            </Link>
          </div>
        </div>
      </Band>
    </InnerPage>
  );
}

function PlanCard({
  name,
  amount,
  period,
  desc,
  popular,
}: {
  name: string;
  amount: number;
  period: string;
  desc: string | null;
  popular?: boolean;
}) {
  return (
    <article
      className={`relative flex flex-col rounded-xl border p-6 sm:p-7 ${
        popular
          ? "border-[var(--pub-hot)] bg-[#0A0F1A] text-white shadow-[0_18px_50px_-24px_rgba(7,11,20,0.7)]"
          : "border-[#0A0F1A]/10 bg-[#F4F1E9] text-[#0A0F1A]"
      }`}
    >
      {popular ? (
        <div className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-md bg-[var(--pub-hot)] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--pub-hot-ink)]">
          <Sparkles className="h-3 w-3" /> Most popular
        </div>
      ) : null}
      <div
        className={`text-sm font-bold uppercase tracking-[0.14em] ${popular ? "text-white/60" : "text-[#0A0F1A]/55"}`}
      >
        {cleanBatchName(name)}
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <span
          className={`font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight sm:text-5xl ${popular ? "text-[var(--pub-hot)]" : ""}`}
        >
          ₹{amount.toLocaleString("en-IN")}
        </span>
        <span className={`text-sm ${popular ? "text-white/65" : "text-[#0A0F1A]/60"}`}>
          {period}
        </span>
      </div>
      {desc ? (
        <p
          className={`mt-4 text-[15px] leading-relaxed ${popular ? "text-white/70" : "text-[#0A0F1A]/75"}`}
        >
          {desc}
        </p>
      ) : null}
      <ul className="mt-5 space-y-2.5 text-[15px]">
        {["Direct UPI payment", "Digital receipt"].map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${popular ? "bg-[var(--pub-hot)] text-[var(--pub-hot-ink)]" : "bg-[#0A0F1A] text-[var(--pub-hot)]"}`}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
