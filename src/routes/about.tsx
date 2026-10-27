import { createFileRoute, Link } from "@tanstack/react-router";
import { isPlatformRequest, seo } from "@/lib/seo";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ArrowRight, Users, Trophy } from "lucide-react";
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
import { useTenant } from "@/lib/tenant-context";
import { useSiteBundle } from "@/lib/use-site-bundle";
import { sectionOne, sectionsBy, siteContentQuery } from "@/lib/site-queries";

export const Route = createFileRoute("/about")({
  head: () =>
    seo({
      title: "About the Academy — Coaches, Facilities & Achievements",
      description:
        "Who we are, the coaches behind every athlete, our facilities and what our players have achieved.",
      path: "/about",
      index: !isPlatformRequest(),
    }),
  component: () => (
    <TenantGate>
      <AboutContent />
    </TenantGate>
  ),
});

const LINK_CARD = `${CARD_CREAM} group flex items-center justify-between gap-3 !p-5 transition-colors hover:border-[#0A0F1A]/40`;

function AboutContent() {
  const tenant = useTenant();
  const site = useSiteBundle();
  const { data: sections = [] } = useQuery({
    ...siteContentQuery(tenant.id),
    initialData: site?.siteContent ?? undefined,
  });
  const about = sectionOne<{ heading?: string; body?: string }>(sections, "about");
  const achievements = sectionsBy(sections, "achievements").map(
    (s) => s.content as { text: string },
  );

  return (
    <InnerPage>
      <PageHero
        pageKey="about"
        eyebrow={`About ${tenant.name}`}
        title={about?.heading ?? `About ${tenant.name}`}
        subtitle={about?.body ?? undefined}
      />
      <Band tone="white" className="!py-10 sm:!py-12">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/coaches" className={LINK_CARD}>
            <div className="flex items-center gap-4">
              <IconTile>
                <Users className="h-5 w-5" />
              </IconTile>
              <div>
                <div className="font-[family-name:var(--font-display)] text-lg font-bold">
                  Meet our coaches
                </div>
                <div className="text-sm text-[#0A0F1A]/65">The people who train every player.</div>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-[#0A0F1A]/60 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link to="/achievements" className={LINK_CARD}>
            <div className="flex items-center gap-4">
              <IconTile>
                <Trophy className="h-5 w-5" />
              </IconTile>
              <div>
                <div className="font-[family-name:var(--font-display)] text-lg font-bold">
                  Achievements
                </div>
                <div className="text-sm text-[#0A0F1A]/65">Wins, awards and records.</div>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-[#0A0F1A]/60 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Band>

      <Band tone="cream">
        {achievements.length > 0 ? (
          <>
            <BandHead n={2} label="Milestones" title="What we have achieved" />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map((a, i) => (
                <li key={i} className={`${CARD_WHITE} flex items-start gap-3`}>
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0A0F1A]" />
                  <span className="text-[#0A0F1A]">{a.text}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyNote>More details coming soon.</EmptyNote>
        )}
      </Band>

      <JoinBand text={`Register online and start training with ${tenant.name}.`} />
    </InnerPage>
  );
}
