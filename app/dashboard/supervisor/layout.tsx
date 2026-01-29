import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SupervisorShell from "@/components/supervisor/supervisor-shell";

export default async function SupervisorDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/auth/login?callbackUrl=/dashboard/supervisor");
  }
  if ((session.user as any)?.role !== "SUPERVISOR_PROYECTOS") {
    redirect("/auth/login?message=You Are Not Authorized!");
  }
  return <SupervisorShell>{children}</SupervisorShell>;
}
