"use client";

import DashboardShell from "@/components/dashboard-shell";
import SupervisorSidebar from "@/components/supervisor/supervisor-sidebar";

export default function SupervisorShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell sidebar={<SupervisorSidebar />} title="Supervisor de Proyectos">
      {children}
    </DashboardShell>
  );
}
