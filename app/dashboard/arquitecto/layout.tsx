import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { ArchitectDashboardSidebar } from "@/components/arquitecto/dashboard-sidebar";

export default async function ArchitectDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/login?callbackUrl=/dashboard/arquitecto");
  if ((session.user as any)?.role !== "ARCHITECTO") {
    redirect("/auth/login?message=You Are Not Authorized!");
  }
  return (
    <DashboardShell sidebar={<ArchitectDashboardSidebar />} title="Panel de Arquitecto">
      {children}
    </DashboardShell>
  );
}
