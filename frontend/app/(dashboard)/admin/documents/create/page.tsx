import type { Metadata } from "next";
import { DocumentsCreate } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Create Document" };

export default function Page() {
  return <DocumentsCreate />;
}
