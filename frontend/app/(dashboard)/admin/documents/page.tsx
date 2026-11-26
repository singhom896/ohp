import type { Metadata } from "next";
import { DocumentsList } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Document Management" };

export default function Page() {
  return <DocumentsList />;
}
