import type { Metadata } from "next";
import { NewsletterSubscribers } from "@/components/console/modules/newsletter";

export const metadata: Metadata = { title: "Newsletter Subscribers" };

export default function Page() {
  return <NewsletterSubscribers />;
}
