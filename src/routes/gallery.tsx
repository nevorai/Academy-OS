import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TenantGate } from "@/components/site/TenantGate";
import { PageHero } from "@/components/site/PageHero";
import { StoragedImage } from "@/components/site/StoragedImage";
import { Band, EmptyNote, InnerPage } from "@/components/site/inner-ui";
import { useTenant } from "@/lib/tenant-context";
import { useSiteBundle } from "@/lib/use-site-bundle";
import { sectionsBy, siteContentQuery } from "@/lib/site-queries";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Gallery" },
      { name: "description", content: "Photo and video gallery from the academy." },
      { property: "og:title", content: "Gallery" },
      { property: "og:description", content: "Photo and video gallery from the academy." },
    ],
  }),
  component: () => (
    <TenantGate>
      <GalleryPage />
    </TenantGate>
  ),
});

function GalleryPage() {
  const tenant = useTenant();
  const site = useSiteBundle();
  const { data: sections = [] } = useQuery({
    ...siteContentQuery(tenant.id),
    initialData: site?.siteContent ?? undefined,
  });
  const items = sectionsBy(sections, "gallery").map(
    (s) => s.content as { url?: string; caption?: string },
  );

  return (
    <InnerPage>
      <PageHero
        pageKey="gallery"
        eyebrow="Moments"
        title="Gallery"
        subtitle={`Life at ${tenant.name}.`}
      />
      {/* Masonry on night: natural aspect ratios, no forced crop, photos stand out */}
      <Band tone="night" className="min-h-[40vh]">
        {items.length === 0 ? (
          <EmptyNote tone="night">Photos and videos coming soon.</EmptyNote>
        ) : (
          <div className="columns-2 gap-3 md:columns-3 xl:columns-4">
            {items.map((it, i) => (
              <figure
                key={i}
                className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border border-white/10 bg-white/5"
              >
                {it.url && (
                  <StoragedImage
                    path={it.url}
                    alt={it.caption ?? ""}
                    className="h-auto w-full transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                )}
                {it.caption && (
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-8 text-xs font-medium text-white">
                    {it.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </Band>
    </InnerPage>
  );
}
