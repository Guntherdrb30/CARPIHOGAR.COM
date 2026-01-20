import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getArchitectUsers, getDesignProjectByIdForSession, updateDesignProjectAction } from "@/server/actions/design-projects";
import { DesignProjectStage, DesignProjectStatus } from "@prisma/client";
import ProjectPipeline from "@/components/estudio/project-pipeline";
import ProjectTasksSection from "@/components/estudio/project-tasks";
import ProjectUpdateForm from "@/components/estudio/project-update-form";

export default async function EditDesignProjectPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; message?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (!session?.user || role !== "ADMIN") {
    redirect(`/auth/login?callbackUrl=/dashboard/admin/estudio/${params.id}`);
  }
  const project = await getDesignProjectByIdForSession(params.id);
  if (!project) {
    redirect("/dashboard/admin/estudio?error=Proyecto%20no%20encontrado");
  }
  const architects = await getArchitectUsers();
  const statuses = Object.values(DesignProjectStatus);
  const stages = Object.values(DesignProjectStage);

  const formatDate = (value: Date | null) => {
    if (!value) return "";
    const d = new Date(value);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editar proyecto</h1>
          <p className="text-sm text-gray-600">Actualiza datos y asignaciones.</p>
        </div>
        <Link className="text-sm text-gray-600 hover:underline" href="/dashboard/admin/estudio">
          Volver
        </Link>
      </div>

      {searchParams?.error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </div>
      )}
      {searchParams?.message && (
        <div className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
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
            <div><span className="font-semibold">Inicio:</span> {formatDate(project.startDate) || "-"}</div>
            <div><span className="font-semibold">Entrega:</span> {formatDate(project.dueDate) || "-"}</div>
            <div><span className="font-semibold">Estatus:</span> {String(project.status).replace(/_/g, " ")}</div>
            <div><span className="font-semibold">Etapa:</span> {String(project.stage).replace(/_/g, " ")}</div>
          </div>
          {project.description && (
            <div className="mt-3 text-sm text-gray-600">{project.description}</div>
          )}
        </div>
        <ProjectPipeline projectId={project.id} stage={project.stage} canUpdate />
      </div>

      <form action={updateDesignProjectAction} className="bg-white rounded-lg shadow p-6 space-y-4">
        <input type="hidden" name="id" value={project.id} />
        <div>
          <label className="text-sm font-semibold text-gray-700">Nombre del proyecto</label>
          <input
            name="name"
            defaultValue={project.name}
            required
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Cliente</label>
          <input
            name="clientName"
            defaultValue={project.clientName}
            required
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Ubicacion</label>
          <input
            name="location"
            defaultValue={project.location}
            required
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Arquitecto responsable</label>
            <select name="architectId" defaultValue={project.architectId || ""} className="mt-1 w-full border rounded px-3 py-2 text-sm">
              <option value="">Sin asignar</option>
              {architects.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Prioridad (1-9)</label>
            <input
              name="priority"
              type="number"
              min={1}
              max={9}
              defaultValue={project.priority}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Fecha inicio</label>
            <input
              name="startDate"
              type="date"
              defaultValue={formatDate(project.startDate)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Fecha entrega</label>
            <input
              name="dueDate"
              type="date"
              defaultValue={formatDate(project.dueDate)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Estatus</label>
          <select name="status" defaultValue={project.status} className="mt-1 w-full border rounded px-3 py-2 text-sm">
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Etapa</label>
          <select name="stage" defaultValue={project.stage} className="mt-1 w-full border rounded px-3 py-2 text-sm">
            {stages.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Descripcion</label>
          <textarea
            name="description"
            rows={4}
            defaultValue={project.description || ""}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            Guardar cambios
          </button>
          <Link href="/dashboard/admin/estudio" className="text-sm text-gray-600 hover:underline">
            Cancelar
          </Link>
        </div>
      </form>

      <ProjectTasksSection
        projectId={project.id}
        tasks={project.tasks as any}
        architects={architects as any}
        role="ADMIN"
        userId={String((session?.user as any)?.id || "")}
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
