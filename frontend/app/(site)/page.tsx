import { Suspense } from "react";
import HomeBanners, { HomeBannersPlaceholder } from "@/components/home/HomeBanners";
import {
  CategoryGrid,
  CategoryGridPlaceholder,
  StatsStrip,
  OpportunityGrid,
  OpportunityGridPlaceholder,
  HowItWorks,
  GalleryGrid,
  GalleryPlaceholder,
  Testimonials,
  ZccSection,
  CtaBand,
} from "@/components/home/HomeSections";
import { ScrollReveal } from "@/components/home/HomeClient";

export default function HomePage() {
  return (
    <main id="main-content" className="home">
      <Suspense fallback={<HomeBannersPlaceholder />}>
        <HomeBanners />
      </Suspense>
      <Suspense fallback={<CategoryGridPlaceholder />}>
        <CategoryGrid />
      </Suspense>
      <Suspense fallback={null}>
        <StatsStrip />
      </Suspense>
      <Suspense fallback={<OpportunityGridPlaceholder />}>
        <OpportunityGrid />
      </Suspense>
      <HowItWorks />
      <Suspense fallback={<GalleryPlaceholder />}>
        <GalleryGrid />
      </Suspense>
      <Testimonials />
      <Suspense fallback={null}>
        <ZccSection />
      </Suspense>
      <CtaBand />
      <ScrollReveal />
    </main>
  );
}
