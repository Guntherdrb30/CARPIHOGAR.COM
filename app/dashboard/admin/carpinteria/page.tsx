import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  createCarpentryProject,
  getCarpentryProjects,
  updateCarpentryProject,
} from "@/server/actions/carpentry";
import { getPayrollEmployees } from "@/server/actions/payroll";
import ProofUploader from "@/components/admin/proof-uploader";

export default async function CarpinteriaAdminPage({ searchParams }: { searchParams?: Promise<{ message?: string; error?: string }> }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    redirect("/auth/login?callbackUrl=/dashboard/admin/carpinteria");
  }
  const sp = (await searchParams) || ({} as any);
  const message = sp.message ? decodeURIComponent(String(sp.message)) : "";
  const error = sp.error ? decodeURIComponent(String(sp.error)) : "";

  const [projects, employees] = await Promise.all([
    getCarpentryProjects(),
    getPayrollEmployees(),
  ]);

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Proyectos de carpinteria</h1>
        <p className="text-sm text-gray-600">Gestion de proyectos y archivos (planos, imagenes).</p>
      </div>

      {message && <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">{message}</div>}
      {error && <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">{error}</div>}

      <section className="bg-white p-4 rounded-lg shadow space-y-4">
        <h2 className="text-lg font-semibold">Crear proyecto</h2>
        <form action={createCarpentryProject} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Nombre</label>
            <input name="name" className="border rounded px-2 py-1 w-full" required />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Cliente</label>
            <input name="clientName" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Email</label>
            <input name="clientEmail" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Telefono</label>
            <input name="clientPhone" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Direccion</label>
            <input name="clientAddress" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Ciudad</label>
            <input name="clientCity" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Estado</label>
            <input name="clientState" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Monto total USD</label>
            <input name="totalAmountUSD" type="number" step="0.01" className="border rounded px-2 py-1 w-full" required />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Pago inicial USD</label>
            <input name="initialPaymentUSD" type="number" step="0.01" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Metodo pago inicial</label>
            <select name="initialPaymentMethod" className="border rounded px-2 py-1 w-full">
              <option value="">Sin metodo</option>
              <option value="PAGO_MOVIL">Pago movil</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="ZELLE">Zelle</option>
              <option value="EFECTIVO">Efectivo</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Fecha pago inicial</label>
            <input name="initialPaymentPaidAt" type="date" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Referencia inicial</label>
            <input name="initialPaymentReference" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Notas pago inicial</label>
            <input name="initialPaymentNotes" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Comprobante inicial</label>
            <ProofUploader inputName="initialPaymentProofUrl" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Costo mano de obra USD</label>
            <input name="laborCostUSD" type="number" step="0.01" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Estado</label>
            <select name="status" className="border rounded px-2 py-1 w-full">
              <option value="ACTIVO">Activo</option>
              <option value="EN_PROCESO">En proceso</option>
              <option value="CERRADO">Cerrado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Carpintero</label>
            <select name="carpenterId" className="border rounded px-2 py-1 w-full">
              <option value="">Sin asignar</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Arquitecto</label>
            <select name="architectId" className="border rounded px-2 py-1 w-full">
              <option value="">Sin asignar</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Supervisor</label>
            <select name="supervisorId" className="border rounded px-2 py-1 w-full">
              <option value="">Sin asignar</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Inicio</label>
            <input name="startDate" type="date" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Fin</label>
            <input name="endDate" type="date" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-6">
            <label className="block text-sm text-gray-700">Descripcion</label>
            <input name="description" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-6">
            <button className="px-3 py-1 rounded bg-blue-600 text-white">Guardar proyecto</button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Proyectos</h2>
          <span className="text-sm text-gray-500">{projects.length} proyectos</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((projectItem: any) => {
            const cover = projectItem.files?.find((f: any) => f.fileType === "IMAGEN")?.url || projectItem.files?.[0]?.url;
            const paid = projectItem.clientPayments?.reduce((sum: number, p: any) => sum + Number(p.amountUSD || 0), 0) || 0;
            return (
              <div key={projectItem.id} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-lg">
                {cover ? (
                  <div className="h-40 w-full overflow-hidden">
                    <img src={cover} alt={projectItem.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center bg-slate-100 text-sm text-gray-500">Sin imagen</div>
                )}
                <div className="p-4 space-y-2 text-sm text-gray-700">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900">{projectItem.name}</h3>
                    <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600">
                      {projectItem.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{projectItem.clientName || "Cliente sin definir"}</p>
                  <div className="text-xs text-gray-500">Pagado: ${paid.toFixed(2)}</div>
                  <div className="text-xs text-gray-500">Monto total: ${Number(projectItem.totalAmountUSD || 0).toFixed(2)}</div>
                  <div className="flex gap-2 pt-3">
                    <a
                      className="rounded-full border border-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-blue-600 hover:bg-blue-50"
                      href={`/dashboard/admin/carpinteria/${projectItem.id}`}
                    >
                      Ver proyecto
                    </a>
                    <a
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 hover:bg-slate-50"
                      href={`/dashboard/admin/carpinteria/${projectItem.id}`}
                    >
                      Control completo
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
          {!projects.length && (
            <div className="text-sm text-gray-500">No hay proyectos creados.</div>
          )}
        </div>
      </section>
    </div>
  );
}
