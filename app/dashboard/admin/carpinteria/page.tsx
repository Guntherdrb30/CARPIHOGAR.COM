import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  createCarpentryProject,
  deleteCarpentryProject,
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

      <section className="bg-white p-4 rounded-lg shadow space-y-4">
        <h2 className="text-lg font-semibold">Proyectos</h2>
        <div className="space-y-4">
          {projects.map((p: any) => {
            const total = Number(p.totalAmountUSD || 0);
            const fabPct = Number(p.fabricationPct || 70);
            const instPct = Number(p.installationPct || 30);
            const fabBudget = (total * fabPct) / 100;
            const instBudget = (total * instPct) / 100;
            const fabPaid = Number(p.fabricationPaidUSD || 0);
            const instPaid = Number(p.installationPaidUSD || 0);
            return (
              <div key={p.id} className="border rounded p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{p.name}</div>
                  <a className="text-sm text-blue-600 hover:underline" href={`/dashboard/admin/carpinteria/${p.id}`}>
                    Ver proyecto
                  </a>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                  <form action={updateCarpentryProject} className="md:col-span-6 grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                    <input type="hidden" name="id" value={p.id} />
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-600">Nombre</label>
                      <input name="name" defaultValue={p.name} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-600">Cliente</label>
                      <input name="clientName" defaultValue={p.clientName || ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Email</label>
                      <input name="clientEmail" defaultValue={p.clientEmail || ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Telefono</label>
                      <input name="clientPhone" defaultValue={p.clientPhone || ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-xs text-gray-600">Direccion</label>
                      <input name="clientAddress" defaultValue={p.clientAddress || ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Ciudad</label>
                      <input name="clientCity" defaultValue={p.clientCity || ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Estado</label>
                      <input name="clientState" defaultValue={p.clientState || ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Monto</label>
                      <input name="totalAmountUSD" type="number" step="0.01" defaultValue={p.totalAmountUSD} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Pago inicial</label>
                      <input name="initialPaymentUSD" type="number" step="0.01" defaultValue={p.initialPaymentUSD ?? ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Mano de obra</label>
                      <input name="laborCostUSD" type="number" step="0.01" defaultValue={p.laborCostUSD ?? ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Estado</label>
                      <select name="status" defaultValue={p.status} className="border rounded px-2 py-1 w-full">
                        <option value="ACTIVO">Activo</option>
                        <option value="EN_PROCESO">En proceso</option>
                        <option value="CERRADO">Cerrado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Carpintero</label>
                      <select name="carpenterId" defaultValue={p.carpenterId || ""} className="border rounded px-2 py-1 w-full">
                        <option value="">Sin asignar</option>
                        {employees.map((e: any) => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Arquitecto</label>
                      <select name="architectId" defaultValue={p.architectId || ""} className="border rounded px-2 py-1 w-full">
                        <option value="">Sin asignar</option>
                        {employees.map((e: any) => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Supervisor</label>
                      <select name="supervisorId" defaultValue={p.supervisorId || ""} className="border rounded px-2 py-1 w-full">
                        <option value="">Sin asignar</option>
                        {employees.map((e: any) => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Inicio</label>
                      <input name="startDate" type="date" defaultValue={p.startDate ? new Date(p.startDate).toISOString().slice(0, 10) : ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600">Fin</label>
                      <input name="endDate" type="date" defaultValue={p.endDate ? new Date(p.endDate).toISOString().slice(0, 10) : ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-xs text-gray-600">Descripcion</label>
                      <input name="description" defaultValue={p.description || ""} className="border rounded px-2 py-1 w-full" />
                    </div>
                    <div className="md:col-span-6 flex gap-2">
                      <button className="px-3 py-1 rounded bg-emerald-600 text-white">Actualizar</button>
                    </div>
                  </form>
                  <form action={deleteCarpentryProject} className="md:col-span-6">
                    <input type="hidden" name="id" value={p.id} />
                    <button className="px-3 py-1 rounded border text-red-600" type="submit">Eliminar</button>
                  </form>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                  <div className="border rounded p-2">
                    <div className="text-gray-600">Fabricacion (70%)</div>
                    <div className="font-semibold">${fabPaid.toFixed(2)} / ${fabBudget.toFixed(2)}</div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="text-gray-600">Instalacion (30%)</div>
                    <div className="font-semibold">${instPaid.toFixed(2)} / ${instBudget.toFixed(2)}</div>
                  </div>
                  <div className="border rounded p-2">
                    <div className="text-gray-600">Total</div>
                    <div className="font-semibold">${total.toFixed(2)}</div>
                  </div>
                </div>

                <div className="text-xs text-gray-500">
                  Gestiona archivos, abonos y tareas desde el detalle del proyecto.
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
