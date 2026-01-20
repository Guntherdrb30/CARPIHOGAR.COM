import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { ProjectBoard, ProjectList } from "@/components/estudio/project-views";
import { getSettings } from "@/server/actions/settings";
import { getSlaConfigFromSettings } from "@/lib/sla";

export default async function AdminDesignStudioPage({
  searchParams,
}: {
  searchParams?: { view?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (!session?.user || role !== "ADMIN") {
    redirect("/auth/login?callbackUrl=/dashboard/admin/estudio");
  }

  const view = searchParams?.view === "crm" ? "crm" : "list";
  const [projects, settings] = await Promise.all([
    prisma.designProject.findMany({
      include: { architect: { select: { id: true, name: true, email: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    }),
    getSettings(),
  ]);
  const slaConfig = getSlaConfigFromSettings(settings);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estudio de Diseno Interior</h1>
          <p className="text-sm text-gray-600">Gestion central de proyectos del estudio.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/admin/estudio?view=list"
            className={`px-3 py-2 rounded border text-sm ${
              view === "list" ? "bg-gray-900 text-white" : "bg-white text-gray-700"
            }`}
          >
            Lista
          </Link>
          <Link
            href="/dashboard/admin/estudio?view=crm"
            className={`px-3 py-2 rounded border text-sm ${
              view === "crm" ? "bg-gray-900 text-white" : "bg-white text-gray-700"
            }`}
          >
            CRM
          </Link>
          <Link
            href="/dashboard/admin/estudio/nuevo"
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            Nuevo proyecto
          </Link>
        </div>
      </div>

      {view === "crm" ? (
        <ProjectBoard projects={projects} slaConfig={slaConfig} />
      ) : (
        <ProjectList
          projects={projects}
          showEdit
          editBaseHref="/dashboard/admin/estudio"
          slaConfig={slaConfig}
        />
      )}
    </div>
  );
}
