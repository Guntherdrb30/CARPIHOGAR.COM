import Link from "next/link";
import { getDesignProjectsForSession } from "@/server/actions/design-projects";
import { ProjectBoard, ProjectList } from "@/components/estudio/project-views";

export default async function ArchitectStudioPage({
  searchParams,
}: {
  searchParams?: { view?: string };
}) {
  const view = searchParams?.view === "crm" ? "crm" : "list";
  const projects = await getDesignProjectsForSession();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estudio de Diseno Interior</h1>
          <p className="text-sm text-gray-600">Tus proyectos asignados.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/arquitecto/estudio?view=list"
            className={`px-3 py-2 rounded border text-sm ${
              view === "list" ? "bg-gray-900 text-white" : "bg-white text-gray-700"
            }`}
          >
            Lista
          </Link>
          <Link
            href="/dashboard/arquitecto/estudio?view=crm"
            className={`px-3 py-2 rounded border text-sm ${
              view === "crm" ? "bg-gray-900 text-white" : "bg-white text-gray-700"
            }`}
          >
            CRM
          </Link>
        </div>
      </div>

      {view === "crm" ? (
        <ProjectBoard projects={projects} />
      ) : (
        <ProjectList
          projects={projects}
          showEdit
          editBaseHref="/dashboard/arquitecto/estudio"
          actionLabel="Ver"
        />
      )}
    </div>
  );
}
