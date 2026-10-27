import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { TenantGate } from "@/components/site/TenantGate";
import { PageHero } from "@/components/site/PageHero";
import {
  Band,
  BandHead,
  CARD_CREAM,
  CARD_WHITE,
  EmptyNote,
  IconTile,
  InnerPage,
  JoinBand,
} from "@/components/site/inner-ui";
import { PACKS } from "@/components/site/home/copy";
import { cleanBatchName, packFor, startMinutes } from "@/components/site/home/model";
import { useTenant } from "@/lib/tenant-context";
import { useSiteBundle } from "@/lib/use-site-bundle";
import { batchesQuery, sectionsBy, siteContentQuery } from "@/lib/site-queries";

export const Route = createFileRoute("/programs")({
  head: () => ({
    meta: [
      { title: "Programs & Batches" },
      { name: "description", content: "Training programs and batches offered by the academy." },
      { property: "og:title", content: "Programs & Batches" },
      {
        property: "og:description",
        content: "Training programs and batches offered by the academy.",
      },
    ],
  }),
  component: () => (
    <TenantGate>
      <ProgramsPage />
    </TenantGate>
  ),
});

function ProgramsPage() {
  const tenant = useTenant();
  const site = useSiteBundle();
  const { data: sections = [] } = useQuery({
    ...siteContentQuery(tenant.id),
    initialData: site?.siteContent ?? undefined,
  });
  const { data: batches = [] } = useQuery({
    ...batchesQuery(tenant.id),
    initialData: site?.batches ?? undefined,
  });
  const programs = sectionsBy(sections, "programs").map(
    (s) =>
      s.content as {
        title?: string;
        description?: string;
        age_group?: string;
      },
  );
  const copy = PACKS[packFor(tenant.niche)];
  // The batches band is light, and the cards on it take the opposite shade of the band before it.
  const batchTone = programs.length > 0 ? "cream" : "white";

  return (
    <InnerPage>
      <PageHero
        pageKey="programs"
        eyebrow="What we offer"
        title="Programs & Batches"
        subtitle={`Choose a program that fits your goals at ${tenant.name}.`}
      />

      {programs.length > 0 ? (
        <Band tone="white">
          <BandHead n={1} label="Programs" title="What you can train for" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((p, i) => (
              <article key={i} className={`${CARD_CREAM} flex flex-col`}>
                {p.age_group ? (
                  <span className="self-start rounded-md bg-[#0A0F1A] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pub-hot)]">
                    {p.age_group}
                  </span>
                ) : null}
                <h3
                  className={`font-[family-name:var(--font-display)] text-xl font-bold ${p.age_group ? "mt-4" : ""}`}
                >
                  {p.title ?? "Program"}
                </h3>
                {p.description ? (
                  <p className="mt-2 text-[15px] leading-relaxed text-[#0A0F1A]/75">
                    {p.description}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </Band>
      ) : null}

      <Band tone={batchTone}>
        <BandHead
          n={programs.length > 0 ? 2 : 1}
          label="Batches"
          title={copy.programsTitle}
          lead={copy.programsLead}
          tone={batchTone}
        />
        {batches.length === 0 ? (
          <div className="mt-10">
            <EmptyNote>Batch details coming soon.</EmptyNote>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...batches]
              .sort((x, y) => (startMinutes(x.timing) ?? 1e9) - (startMinutes(y.timing) ?? 1e9))
              .map((b) => (
                <article
                  key={b.id}
                  className={`${batchTone === "cream" ? CARD_WHITE : CARD_CREAM} flex items-start gap-4`}
                >
                  <IconTile>
                    <Clock className="h-5 w-5" />
                  </IconTile>
                  <div className="min-w-0">
                    <h3 className="font-[family-name:var(--font-display)] text-lg font-bold leading-snug">
                      {cleanBatchName(b.name)}
                    </h3>
                    {b.timing ? (
                      <p className="mt-1 text-[15px] tabular-nums text-[#0A0F1A]/75">{b.timing}</p>
                    ) : null}
                  </div>
                </article>
              ))}
          </div>
        )}
      </Band>

      <JoinBand text="Register in minutes. No account is needed to start." />
    </InnerPage>
  );
}
