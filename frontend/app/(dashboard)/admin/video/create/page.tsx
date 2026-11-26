import type { Metadata } from "next";
import { VideosCreate } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Create Video" };

export default function Page() {
  return <VideosCreate />;
}
