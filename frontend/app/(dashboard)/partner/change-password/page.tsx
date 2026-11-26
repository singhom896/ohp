import type { Metadata } from "next";
import { ChangePasswordPage } from "@/components/console/modules/account";

export const metadata: Metadata = { title: "Change Password" };

export default function Page() {
  return <ChangePasswordPage />;
}