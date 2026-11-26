import type { Metadata } from "next";
import { ModulesCreate } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "Create Module" };

export default function Page() {
  return <ModulesCreate />;
}
