import { getCarpentryProjects, createCarpentryProject, updateCarpentryProject, deleteCarpentryProject } from "@/server/actions/carpentry";
import { PendingButton } from "@/components/pending-button";

const STATUS_OPTIONS = ["ACTIVO", "EN_PROCESO", "CERRADO"];

function toDateInput(value?: Date | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

export default async function SupervisorCarpentryPage() {
  const projects = await getCarpentryProjects();
  const totalAmount = projects.reduce((sum, project) => sum + Number(project.totalAmountUSD || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proyectos de Carpintería</h1>
          <p className="text-sm text-gray-600">Crea, edita o elimina proyectos desde aquí.</p>
        </div>
        <div className="space-y-1 text-sm text-gray-500">
          <p>Total proyectos: <strong className="text-gray-900">{projects.length}</strong></p>
          <p>Valor total: <strong className="text-gray-900">{formatCurrency(totalAmount)}</strong></p>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Crear nuevo proyecto</h2>
        <form action={createCarpentryProject} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input name="name" placeholder="Nombre" className="border rounded px-3 py-2" required />
            <input name="clientName" placeholder="Cliente" className="border rounded px-3 py-2" />
            <input name="totalAmountUSD" type="number" step="0.01" min="0.01" placeholder="Monto total USD" className="border rounded px-3 py-2" required />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input name="clientPhone" placeholder="Teléfono" className="border rounded px-3 py-2" />
            <input name="status" list="status-options" defaultValue="ACTIVO" className="border rounded px-3 py-2" />
            <datalist id="status-options">
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status} />
              ))}
            </datalist>
            <input name="startDate" type="date" className="border rounded px-3 py-2" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input name="endDate" type="date" className="border rounded px-3 py-2" />
            <textarea name="description" placeholder="Descripción" rows={2} className="col-span-1 md:col-span-3 border rounded px-3 py-2" />
          </div>
          <PendingButton className="bg-amber-600 text-white px-4 py-2 rounded" pendingText="Creando...">
            Crear proyecto
          </PendingButton>
        </form>
      </section>

      <section className="space-y-4">
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white/70 p-6 text-center text-sm text-gray-500">
            Todavía no se han creado proyectos.
          </div>
        ) : (
          projects.map((project) => (
            <article key={project.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-gray-900">{project.name}</p>
                  <p className="text-sm text-gray-500">{project.clientName || "Cliente sin nombre"}</p>
                </div>
                <div className="text-sm text-gray-500">
                  <p>{project.status}</p>
                  <p>{formatCurrency(Number(project.totalAmountUSD || 0))}</p>
                </div>
              </div>
              <details className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">Editar o eliminar proyecto</summary>
                <div className="mt-3 space-y-3">
                  <form action={updateCarpentryProject} className="space-y-3">
                    <input type="hidden" name="id" value={project.id} />
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <input name="name" defaultValue={project.name} className="border rounded px-3 py-2" />
                      <input name="clientName" defaultValue={project.clientName || ''} className="border rounded px-3 py-2" />
                      <input name="totalAmountUSD" type="number" step="0.01" min="0" defaultValue={project.totalAmountUSD ? Number(project.totalAmountUSD).toFixed(2) : ''} className="border rounded px-3 py-2" />
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <input name="status" list="status-options" defaultValue={project.status} className="border rounded px-3 py-2" />
                      <input name="startDate" type="date" defaultValue={toDateInput(project.startDate)} className="border rounded px-3 py-2" />
                      <input name="endDate" type="date" defaultValue={toDateInput(project.endDate)} className="border rounded px-3 py-2" />
                    </div>
                    <textarea name="description" rows={2} defaultValue={project.description || ''} className="w-full rounded border px-3 py-2" placeholder="Notas internas" />
                    <PendingButton className="bg-emerald-600 text-white px-4 py-2 rounded" pendingText="Guardando...">
                      Guardar cambios
                    </PendingButton>
                  </form>
                  <form action={deleteCarpentryProject} className="flex justify-end">
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
