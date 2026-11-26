import type { Metadata } from "next";
import { TestimonialsCreate } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Create Testimonial" };

export default function Page() {
  return <TestimonialsCreate />;
}
