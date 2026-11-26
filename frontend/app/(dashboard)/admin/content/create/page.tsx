import type { Metadata } from "next";
import { ContentCreate } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Create Content" };

export default function Page() {
  return <ContentCreate />;
}
