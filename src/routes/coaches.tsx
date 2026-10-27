import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TenantGate } from "@/components/site/TenantGate";
import { PageHero } from "@/components/site/PageHero";
import { PersonAvatar } from "@/components/site/PersonAvatar";
import { Band, EmptyNote, InnerPage, JoinBand } from "@/components/site/inner-ui";
import { tidyName } from "@/components/site/home/model";
import { useTenant } from "@/lib/tenant-context";
import { useSiteBundle } from "@/lib/use-site-bundle";
import { sectionsBy, siteContentQuery } from "@/lib/site-queries";

export const Route = createFileRoute("/coaches")({
  head: () => ({
    meta: [
      { title: "Our Coaches" },
      { name: "description", content: "Meet the coaching staff." },
      { property: "og:title", content: "Our Coaches" },
      { property: "og:description", content: "Meet the coaching staff." },
    ],
  }),
  component: () => (
    <TenantGate>
      <CoachesPage />
    </TenantGate>
  ),
});

function CoachesPage() {
  const tenant = useTenant();
  const site = useSiteBundle();
  const { data: sections = [] } = useQuery({
    ...siteContentQuery(tenant.id),
    initialData: site?.siteContent ?? undefined,
  });
  const coaches = sectionsBy(sections, "coaches").map(
    (s) =>
      s.content as {
        name?: string;
        role?: string;
        bio?: string;
        photo_url?: string;
      },
  );

  return (
    <InnerPage>
      <PageHero
        pageKey="coaches"
        eyebrow="Coaching staff"
        title="Our Coaches"
        subtitle={`Learn from experienced coaches at ${tenant.name}.`}
      />
      <Band tone="white">
        {coaches.length === 0 ? (
          <EmptyNote>Coach profiles coming soon.</EmptyNote>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {coaches.map((c, i) => (
              <article
                key={i}
                className="flex items-start gap-5 rounded-xl border border-white/10 bg-[#0A0F1A] p-6 text-white sm:gap-6 sm:p-7"
              >
                <PersonAvatar
                  src={c.photo_url ?? null}
                  name={c.name ?? "Coach"}
                  className="h-24 w-24 shrink-0 ring-2 ring-[var(--pub-hot)] ring-offset-2 ring-offset-[#0A0F1A] sm:h-28 sm:w-28"
                />
                <div className="min-w-0">
                  <h2 className="font-[family-name:var(--font-display)] text-xl font-extrabold leading-tight">
                    {tidyName(c.name ?? "")}
                  </h2>
                  {c.role ? (
                    <p className="mt-1 text-sm font-bold uppercase tracking-[0.14em] text-[var(--pub-hot)]">
                      {c.role}
                    </p>
                  ) : null}
                  {c.bio ? (
                    <p className="mt-3 text-[15px] leading-relaxed text-white/70">{c.bio}</p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </Band>
      <JoinBand
        text={`Train with the coaches at ${tenant.name}. Register online in a few minutes.`}
      />
    </InnerPage>
  );
}
