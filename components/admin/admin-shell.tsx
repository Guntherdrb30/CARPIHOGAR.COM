"use client";

import { usePathname } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import AdminSidebar from "@/components/admin/sidebar";
import DesignStudioSidebar from "@/components/estudio/design-sidebar";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inDesignStudio = pathname.startsWith("/dashboard/admin/estudio");
  const sidebar = inDesignStudio ? <DesignStudioSidebar role="ADMIN" /> : <AdminSidebar />;
  const title = inDesignStudio ? "Estudio de Diseno" : "Panel Admin";
  return (
    <DashboardShell sidebar={sidebar} title={title}>
      <div className="min-w-0">{children}</div>
    </DashboardShell>
  );
}
