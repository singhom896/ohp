import type { Metadata } from "next";
import { UsersCreate } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "Create User" };

export default function Page() {
  return <UsersCreate />;
}
