import type { Metadata } from "next";
import { TestimonialsList } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Testimonial Management" };

export default function Page() {
  return <TestimonialsList />;
}
