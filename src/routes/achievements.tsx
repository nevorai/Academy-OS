import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TenantGate } from "@/components/site/TenantGate";
import { PageHero } from "@/components/site/PageHero";
import {
  Band,
  BandHead,
  CARD_CREAM,
  CARD_NIGHT,
  EmptyNote,
  IconTile,
  InnerPage,
  JoinBand,
} from "@/components/site/inner-ui";
import { useTenant } from "@/lib/tenant-context";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Star, Award } from "lucide-react";

export const Route = createFileRoute("/achievements")({
  head: () => ({
    meta: [
      { title: "Achievements" },
      { name: "description", content: "Academy records, hall of fame, and recognitions." },
      { property: "og:title", content: "Achievements" },
      { property: "og:description", content: "Academy records, hall of fame, and recognitions." },
    ],
  }),
  component: () => (
    <TenantGate>
      <AchievementsPage />
    </TenantGate>
  ),
});

function AchievementsPage() {
  const tenant = useTenant();
  const bundle = useQuery({
    queryKey: ["public_academy_bundle", tenant.slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_academy_bundle", {
        _slug: tenant.slug,
      });
      if (error) throw error;
      return data as {
        academy_records: Array<{
          id: string;
          record_type: string;
          title: string;
          description: string | null;
          value: string | null;
        }>;
        hall_of_fame: Array<{
          id: string;
          title: string;
          description: string | null;
          image_url: string | null;
        }>;
        recognitions: Array<{
          id: string;
          title: string;
          recognition_type: string;
          description: string | null;
        }>;
      } | null;
    },
    staleTime: 60_000,
  });

  const records = bundle.data?.academy_records ?? [];
  const hof = bundle.data?.hall_of_fame ?? [];
  const recognitions = bundle.data?.recognitions ?? [];
  const empty = !bundle.isLoading && !records.length && !hof.length && !recognitions.length;

  return (
    <InnerPage>
      <PageHero
        pageKey="achievements"
        eyebrow="Legacy"
        title="Achievements"
        subtitle={`Records, honors, and recognitions from ${tenant.name}.`}
      />
      <Band tone="white">
        <div className="space-y-16">
          {empty && <EmptyNote>Achievements coming soon.</EmptyNote>}

          {bundle.isLoading && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          )}

          {records.length > 0 && (
            <section>
              <BandHead n={1} label="By the numbers" title="Academy records" />
              <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {records.map((r) => (
                  <article key={r.id} className={`${CARD_NIGHT} !bg-[#0A0F1A] text-white`}>
                    <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-white/60">
                      <Trophy className="h-4 w-4 text-[var(--pub-hot)]" />
                      {r.record_type}
                    </div>
                    {r.value && (
                      <div className="mt-4 font-[family-name:var(--font-display)] text-5xl font-extrabold leading-none tracking-tight text-[var(--pub-hot)]">
                        {r.value}
                      </div>
                    )}
                    <h3 className="mt-4 text-lg font-bold">{r.title}</h3>
                    {r.description && (
                      <p className="mt-2 text-[15px] leading-relaxed text-white/70">
                        {r.description}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {hof.length > 0 && (
            <section>
              <BandHead n={2} label="Honour roll" title="Hall of fame" />
              <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {hof.map((h) => (
                  <article key={h.id} className={CARD_CREAM}>
                    <IconTile>
                      <Star className="h-5 w-5" />
                    </IconTile>
                    <h3 className="mt-4 font-[family-name:var(--font-display)] text-lg font-bold">
                      {h.title}
                    </h3>
                    {h.description && (
                      <p className="mt-2 text-[15px] leading-relaxed text-[#0A0F1A]/75">
                        {h.description}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {recognitions.length > 0 && (
            <section>
              <BandHead n={3} label="Awards" title="Recognitions" />
              <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {recognitions.map((r) => (
                  <article key={r.id} className={CARD_CREAM}>
                    <IconTile>
                      <Award className="h-5 w-5" />
                    </IconTile>
                    <div className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-[#0A0F1A]/55">
                      {r.recognition_type}
                    </div>
                    <h3 className="mt-1 font-[family-name:var(--font-display)] text-lg font-bold">
                      {r.title}
                    </h3>
                    {r.description && (
                      <p className="mt-2 text-[15px] leading-relaxed text-[#0A0F1A]/75">
                        {r.description}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </Band>
      <JoinBand
        title="Be part of the story"
        text={`Train at ${tenant.name} and add your name to the list.`}
        cta="Join the academy"
      />
    </InnerPage>
  );
}
