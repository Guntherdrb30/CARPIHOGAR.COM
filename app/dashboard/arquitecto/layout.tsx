import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ArchitectShell from "@/components/arquitecto/architect-shell";

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
  const userId = String((session.user as any)?.id || "");
  return (
    <ArchitectShell userId={userId}>
      {children}
    </ArchitectShell>
  );
}
