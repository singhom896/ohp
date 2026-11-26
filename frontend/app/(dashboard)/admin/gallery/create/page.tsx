import type { Metadata } from "next";
import { GalleryCreate } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Create Gallery" };

export default function Page() {
  return <GalleryCreate />;
}
