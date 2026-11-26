// /gallery - Photo & Video Gallery (CMS Management -> Gallery / Video, and
// photos / videos added to events). Menu: Administration -> Menus (Media).
import type { Metadata } from "next";
import { Suspense } from "react";
import PageHero from "@/components/site/pages/PageHero";
import MediaGallery from "@/components/site/pages/MediaGallery";
import { getMedia } from "@/lib/api/pages";

export const metadata: Metadata = { title: "Photo & Video Gallery" };

export default function GalleryPage() {
  return (
    <main id="main-content" className="op-page">
      <PageHero title="Photo & Video Gallery" intro="Explore photos and videos of cultural programmes, performances and events." crumbs={[{ label: "Media" }]} />
      <div className="container">
        <Suspense fallback={<div className="op-loading">Loading gallery…</div>}>
          <Gallery />
        </Suspense>
      </div>
    </main>
  );
}

async function Gallery() {
  const data = await getMedia();
  if (!data) return <p className="op-empty">The gallery could not be loaded. Please try again later.</p>;
  return <MediaGallery data={data} />;
}
