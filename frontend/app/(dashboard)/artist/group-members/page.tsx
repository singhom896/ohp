import type { Metadata } from "next";
import { GroupMembers } from "@/components/console/modules/workspace";

export const metadata: Metadata = { title: "Artist Members" };

export default function Page() {
  return <GroupMembers />;
}