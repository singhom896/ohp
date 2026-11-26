import type { Metadata } from "next";
import { GalleryList } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Gallery Management" };

export default function Page() {
  return <GalleryList />;
}
