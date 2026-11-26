import Sidebar from "@/components/dashboard/Sidebar";
import { ministryMenu } from "@/lib/data/sidebar-menus";

export default function MinistryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-layout">
      <Sidebar menu={ministryMenu} />
      <section className="admin-main">{children}</section>
    </div>
  );
}
