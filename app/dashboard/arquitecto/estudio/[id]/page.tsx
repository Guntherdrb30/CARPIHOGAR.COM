import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDesignProjectByIdForSession, updateDesignProjectStatusAction } from "@/server/actions/design-projects";
import { DesignProjectStatus } from "@prisma/client";
import ProjectPipeline from "@/components/estudio/project-pipeline";
import ProjectTasksSection from "@/components/estudio/project-tasks";
import ProjectUpdateForm from "@/components/estudio/project-update-form";
import { getSettings } from "@/server/actions/settings";
import { getSlaConfigFromSettings } from "@/lib/sla";
import SlaBadge from "@/components/estudio/sla-badge";

export default async function ArchitectProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; message?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (!session?.user || role !== "ARCHITECTO") {
    redirect(`/auth/login?callbackUrl=/dashboard/arquitecto/estudio/${params.id}`);
  }
  const [project, settings] = await Promise.all([
    getDesignProjectByIdForSession(params.id),
    getSettings(),
  ]);
  if (!project) {
    redirect("/dashboard/arquitecto/estudio?error=Proyecto%20no%20encontrado");
  }
  const slaConfig = getSlaConfigFromSettings(settings);
  const statuses = Object.values(DesignProjectStatus);
  const userId = String((session?.user as any)?.id || "");

  const formatDate = (value: Date | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-sm text-gray-600">Ficha del proyecto</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <a
            className="text-blue-600 hover:underline"
            href={`/api/reports/design/projects/${project.id}/pdf?includeAmounts=0`}
            target="_blank"
            rel="noreferrer"
          >
            Reporte PDF
          </a>
          <Link className="text-sm text-gray-600 hover:underline" href="/dashboard/arquitecto/estudio">
            Volver
          </Link>
        </div>
      </div>

      {searchParams?.error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </div>
      )}
      {searchParams?.message && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {searchParams.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Resumen general</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
            <div><span className="font-semibold">Cliente:</span> {project.clientName}</div>
            <div><span className="font-semibold">Ubicacion:</span> {project.location}</div>
            <div><span className="font-semibold">Arquitecto:</span> {project.architect?.name || project.architect?.email || "Sin asignar"}</div>
            <div><span className="font-semibold">Prioridad:</span> {project.priority}</div>
            <div><span className="font-semibold">Inicio:</span> {formatDate(project.startDate)}</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Entrega:</span>
              <span>{formatDate(project.dueDate)}</span>
              <SlaBadge dueDate={project.dueDate} config={slaConfig} />
            </div>
            <div><span className="font-semibold">Estatus:</span> {String(project.status).replace(/_/g, " ")}</div>
            <div><span className="font-semibold">Etapa:</span> {String(project.stage).replace(/_/g, " ")}</div>
          </div>
          {project.description && (
            <div className="mt-3 text-sm text-gray-600">{project.description}</div>
          )}
        </div>
        <ProjectPipeline
          projectId={project.id}
          stage={project.stage}
          canUpdate
          dueDate={project.dueDate}
          slaConfig={slaConfig}
        />
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Actualizar estatus</h2>
        <form action={updateDesignProjectStatusAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={project.id} />
          <select name="status" defaultValue={project.status} className="border rounded px-3 py-2 text-sm">
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <button className="px-3 py-2 rounded bg-gray-900 text-white text-sm font-semibold">
            Guardar estatus
          </button>
        </form>
      </div>

      <ProjectTasksSection
        projectId={project.id}
        tasks={project.tasks as any}
        architects={[]}
        role="ARCHITECTO"
        userId={userId}
        slaConfig={slaConfig}
      />

      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Avances</h2>
        {project.updates.length === 0 ? (
          <div className="text-sm text-gray-500">No hay avances registrados.</div>
        ) : (
          <div className="space-y-3 text-sm">
            {project.updates.map((u) => (
              <div key={u.id} className="border rounded px-3 py-2">
                <div className="text-gray-900 font-semibold">
                  {u.createdBy?.name || u.createdBy?.email || "Usuario"}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(u.createdAt).toLocaleString()}
                </div>
                {u.note && <div className="mt-2 text-gray-700">{u.note}</div>}
                {u.fileUrl && (
                  <a
                    className="mt-2 inline-block text-blue-600 underline"
                    href={u.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver archivo
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        <ProjectUpdateForm projectId={project.id} canPost />
      </div>
    </div>
  );
}
