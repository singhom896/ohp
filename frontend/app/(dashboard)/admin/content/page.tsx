import type { Metadata } from "next";
import { ContentList } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Content Management" };

export default function Page() {
  return <ContentList />;
}
