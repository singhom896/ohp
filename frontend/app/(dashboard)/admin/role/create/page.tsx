import type { Metadata } from "next";
import { RolesCreate } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "Create Role" };

export default function Page() {
  return <RolesCreate />;
}
