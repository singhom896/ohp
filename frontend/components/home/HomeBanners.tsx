// Home page banners, managed in the admin console: CMS Management -> Banners
// (title, image, priority ordering, active). Saving there refreshes the slider.
import { getBanners } from "@/lib/api/public";
import banner1 from "@/assets/images/home-banner-1.png";
import banner2 from "@/assets/images/home-banner-2.png";
import HeroCarousel, { type HeroSlide } from "./HeroCarousel";

/** Built-in banners: shown while the CMS banners load, or when none are active. */
const fallbackSlides: HeroSlide[] = [
  { key: "default-1", image: banner1.src, alt: "Opportunity Hub for Indian Artists" },
  { key: "default-2", image: banner2.src, alt: "Artists and organizers connecting through Opportunity Hub" },
];

export function HomeBannersPlaceholder() {
  return <HeroCarousel slides={fallbackSlides} />;
}

export default async function HomeBanners() {
  const banners = await getBanners();
  if (!banners.length) return <HomeBannersPlaceholder />;

  return <HeroCarousel slides={banners.map((b) => ({ key: b.id, image: b.image, alt: b.title, title: b.title }))} />;
}
