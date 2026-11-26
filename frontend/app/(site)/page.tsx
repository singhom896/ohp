import { Suspense } from "react";
import HomeBanners, { HomeBannersPlaceholder } from "@/components/home/HomeBanners";
import {
  CategoryGrid,
  StatsStrip,
  OpportunityGrid,
  OpportunityGridPlaceholder,
  HowItWorks,
  GalleryGrid,
  GalleryPlaceholder,
  TestimonialSection,
  CtaBand,
} from "@/components/home/HomeSections";
import { artistTestimonials, organizerTestimonials } from "@/lib/data/home";

export default function HomePage() {
  return (
    <main id="main-content">
      <Suspense fallback={<HomeBannersPlaceholder />}>
        <HomeBanners />
      </Suspense>
      <CategoryGrid />
      <StatsStrip />
      <Suspense fallback={<OpportunityGridPlaceholder />}>
        <OpportunityGrid />
      </Suspense>
      <HowItWorks />
      <Suspense fallback={<GalleryPlaceholder />}>
        <GalleryGrid />
      </Suspense>
      <TestimonialSection
        eyebrow="Voices from the community"
        title="What Artists Say"
        intro="Real experiences from artists using Opportunity Hub to discover and grow their opportunities."
        items={artistTestimonials}
      />
      <TestimonialSection
        title="What Organizers Say"
        intro="How hotels, institutions and programme coordinators use the platform to find verified talent."
        items={organizerTestimonials}
      />
      <CtaBand />
    </main>
  );
}
