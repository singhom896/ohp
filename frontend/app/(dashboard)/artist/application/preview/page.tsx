import type { Metadata } from "next";
import { ApplicationPreview } from "@/components/console/modules/applications";

export const metadata: Metadata = { title: "My Application - Request Preview" };

export default function Page() {
  return <ApplicationPreview />;
}
