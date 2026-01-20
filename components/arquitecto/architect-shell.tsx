"use client";

import { usePathname } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { ArchitectDashboardSidebar } from "@/components/arquitecto/dashboard-sidebar";
import DesignStudioSidebar from "@/components/estudio/design-sidebar";

export default function ArchitectShell({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const pathname = usePathname();
  const inDesignStudio = pathname.startsWith("/dashboard/arquitecto/estudio");
  const sidebar = inDesignStudio
    ? <DesignStudioSidebar role="ARCHITECTO" userId={userId} />
    : <ArchitectDashboardSidebar />;
  const title = inDesignStudio ? "Estudio de Diseno" : "Panel de Arquitecto";
  return (
    <DashboardShell sidebar={sidebar} title={title}>
      {children}
    </DashboardShell>
  );
}
