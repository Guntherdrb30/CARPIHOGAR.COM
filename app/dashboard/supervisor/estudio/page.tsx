import { getDesignProjectsForSession, getArchitectUsers, createDesignProjectAction, updateDesignProjectAction, deleteDesignProjectAction } from "@/server/actions/design-projects";
import { PendingButton } from "@/components/pending-button";
import { DesignProjectStatus, DesignProjectStage } from "@prisma/client";

function toDateInput(value?: Date | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function formatCurrency(value?: number) {
  if (value == null) return "-";
  return `$${value.toFixed(2)}`;
}

const STATUS_OPTIONS = Object.values(DesignProjectStatus);
const STAGE_OPTIONS = Object.values(DesignProjectStage);

export default async function SupervisorDesignPage() {
  const [projects, architects] = await Promise.all([
    getDesignProjectsForSession(),
    getArchitectUsers(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estudio de Diseño Interior</h1>
          <p className="text-sm text-gray-600">Administra los proyectos del estudio con acceso directo a cada registro.</p>
        </div>
        <div className="space-y-1 text-sm text-gray-500">
          <p>Total proyectos: <strong className="text-gray-900">{projects.length}</strong></p>
          <p>Arquitectos activos: <strong className="text-gray-900">{architects.length}</strong></p>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Crear nuevo proyecto</h2>
        <form action={createDesignProjectAction} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input name="name" placeholder="Nombre del proyecto" className="border rounded px-3 py-2" required />
            <input name="clientName" placeholder="Cliente" className="border rounded px-3 py-2" required />
            <input name="location" placeholder="Ubicación" className="border rounded px-3 py-2" required />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input name="priority" type="number" min="1" max="9" step="1" defaultValue={5} placeholder="Prioridad" className="border rounded px-3 py-2" required />
            <select name="status" defaultValue={DesignProjectStatus.NUEVO} className="border rounded px-3 py-2" required>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select name="stage" defaultValue={DesignProjectStage.BRIEFING} className="border rounded px-3 py-2">
              {STAGE_OPTIONS.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input name="startDate" type="date" className="border rounded px-3 py-2" />
            <input name="dueDate" type="date" className="border rounded px-3 py-2" />
            <input name="designTotalUSD" type="number" step="0.01" min="0" placeholder="Total USD" className="border rounded px-3 py-2" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <select name="architectId" className="border rounded px-3 py-2">
              <option value="">Sin arquitecto</option>
              {architects.map((architect) => (
                <option key={architect.id} value={architect.id}>
                  {architect.name || architect.email}
                </option>
              ))}
            </select>
            <input name="initialMeasurements" placeholder="Medidas iniciales" className="border rounded px-3 py-2" />
            <input name="description" placeholder="Descripción breve" className="border rounded px-3 py-2" />
          </div>
          <PendingButton className="bg-emerald-600 text-white px-4 py-2 rounded" pendingText="Creando...">
            Crear proyecto
          </PendingButton>
        </form>
      </section>

      <section className="space-y-4">
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white/70 p-6 text-center text-sm text-gray-500">
            No hay proyectos registrados.
          </div>
        ) : (
          projects.map((project) => (
            <article key={project.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-gray-900">{project.name}</p>
                  <p className="text-sm text-gray-500">{project.clientName}</p>
                </div>
                <div className="text-sm text-gray-500">
                  <p>Status: {project.status}</p>
                  <p>Prioridad: {project.priority}</p>
                </div>
              </div>
              <details className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">Editar o eliminar</summary>
                <div className="mt-3 space-y-3">
                  <form action={updateDesignProjectAction} className="space-y-3">
                    <input type="hidden" name="id" value={project.id} />
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <input name="name" defaultValue={project.name} className="border rounded px-3 py-2" />
                      <input name="clientName" defaultValue={project.clientName} className="border rounded px-3 py-2" />
                      <input name="location" defaultValue={project.location} className="border rounded px-3 py-2" />
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <input name="priority" type="number" min="1" max="9" step="1" defaultValue={project.priority} className="border rounded px-3 py-2" />
                      <select name="status" defaultValue={project.status} className="border rounded px-3 py-2">
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <select name="stage" defaultValue={project.stage} className="border rounded px-3 py-2">
                        {STAGE_OPTIONS.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <input name="startDate" type="date" defaultValue={toDateInput(project.startDate)} className="border rounded px-3 py-2" />
                      <input name="dueDate" type="date" defaultValue={toDateInput(project.dueDate)} className="border rounded px-3 py-2" />
                      <input name="designTotalUSD" type="number" step="0.01" min="0" defaultValue={project.designTotalUSD != null ? Number(project.designTotalUSD).toFixed(2) : ''} className="border rounded px-3 py-2" />
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <select name="architectId" defaultValue={project.architect?.id || ''} className="border rounded px-3 py-2">
                        <option value="">Sin arquitecto</option>
                        {architects.map((architect) => (
                          <option key={architect.id} value={architect.id}>
                            {architect.name || architect.email}
                          </option>
                        ))}
                      </select>
                      <input name="initialMeasurements" defaultValue={project.initialMeasurements || ''} placeholder="Medidas" className="border rounded px-3 py-2" />
                      <input name="description" defaultValue={project.description || ''} placeholder="Descripción" className="border rounded px-3 py-2" />
                    </div>
                    <PendingButton className="bg-emerald-600 text-white px-4 py-2 rounded" pendingText="Guardando...">
                      Guardar cambios
                    </PendingButton>
                  </form>
                  <form action={deleteDesignProjectAction} className="flex justify-end">
                    <input type="hidden" name="id" value={project.id} />
                    <PendingButton className="bg-red-600 text-white px-4 py-2 rounded" pendingText="Eliminando...">
                      Eliminar proyecto
                    </PendingButton>
                  </form>
                </div>
              </details>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
