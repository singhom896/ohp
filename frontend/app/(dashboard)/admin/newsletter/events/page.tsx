import type { Metadata } from "next";
import { NewsletterEvents } from "@/components/console/modules/newsletter";

export const metadata: Metadata = { title: "Newsletter Event Emails" };

export default function Page() {
  return <NewsletterEvents />;
}
