import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  createCarpentryClientPayment,
  createCarpentryTask,
  getCarpentryProjectById,
  updateCarpentryProject,
  updateCarpentryTaskStatus,
} from "@/server/actions/carpentry";
import { getPayrollEmployees } from "@/server/actions/payroll";
import CarpentryFileUploader from "@/components/admin/carpentry-file-uploader";
import ProofUploader from "@/components/admin/proof-uploader";

export default async function CarpinteriaProjectPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ message?: string; error?: string }> }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    redirect("/auth/login?callbackUrl=/dashboard/admin/carpinteria");
  }
  const { id } = await params;
  const sp = (await searchParams) || ({} as any);
  const message = sp.message ? decodeURIComponent(String(sp.message)) : "";
  const error = sp.error ? decodeURIComponent(String(sp.error)) : "";

  const [project, employees] = await Promise.all([
    getCarpentryProjectById(id),
    getPayrollEmployees(),
  ]);
  if (!project) {
    return <div className="p-4">Proyecto no encontrado.</div>;
  }

  const clientPaid = project.clientPayments.reduce((sum: number, p: any) => sum + Number(p.amountUSD || 0), 0);
  const total = Number(project.totalAmountUSD || 0);
  const balance = total - clientPaid;
  const fabPct = Number(project.fabricationPct || 70);
  const instPct = Number(project.installationPct || 30);
  const fabBudget = (total * fabPct) / 100;
  const instBudget = (total * instPct) / 100;
  const fabPaid = Number(project.fabricationPaidUSD || 0);
  const instPaid = Number(project.installationPaidUSD || 0);

  const countByType = (type: string) => project.files.filter((f: any) => f.fileType === type).length;

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-gray-600">Proyecto de carpinteria</p>
        </div>
        <a className="text-sm text-blue-600 hover:underline" href="/dashboard/admin/carpinteria">
          Volver
        </a>
      </div>

      {message && <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">{message}</div>}
      {error && <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">{error}</div>}

      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-semibold">Resumen</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-gray-600">Cliente</div>
            <div className="font-medium">{project.clientName || "-"}</div>
            <div>{project.clientPhone || ""}</div>
            <div>{project.clientEmail || ""}</div>
          </div>
          <div>
            <div className="text-gray-600">Direccion</div>
            <div>{project.clientAddress || "-"}</div>
            <div>{[project.clientCity, project.clientState].filter(Boolean).join(", ")}</div>
          </div>
          <div>
            <div className="text-gray-600">Montos</div>
            <div>Total: ${total.toFixed(2)}</div>
            <div>Pago inicial: ${Number(project.initialPaymentUSD || 0).toFixed(2)}</div>
            <div>Pagado: ${clientPaid.toFixed(2)}</div>
            <div className="font-semibold">Saldo: ${balance.toFixed(2)}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="border rounded p-2">
            <div className="text-gray-600">Fabricacion (70%)</div>
            <div className="font-semibold">${fabPaid.toFixed(2)} / ${fabBudget.toFixed(2)}</div>
          </div>
          <div className="border rounded p-2">
            <div className="text-gray-600">Instalacion (30%)</div>
            <div className="font-semibold">${instPaid.toFixed(2)} / ${instBudget.toFixed(2)}</div>
          </div>
          <div className="border rounded p-2">
            <div className="text-gray-600">Mano de obra</div>
            <div className="font-semibold">${Number(project.laborCostUSD || 0).toFixed(2)}</div>
          </div>
        </div>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-semibold">Equipo</h2>
        <form action={updateCarpentryProject} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <input type="hidden" name="id" value={project.id} />
          <div>
            <label className="block text-sm text-gray-700">Carpintero</label>
            <select name="carpenterId" defaultValue={project.carpenterId || ""} className="border rounded px-2 py-1 w-full">
              <option value="">Sin asignar</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Arquitecto</label>
            <select name="architectId" defaultValue={project.architectId || ""} className="border rounded px-2 py-1 w-full">
              <option value="">Sin asignar</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Supervisor</label>
            <select name="supervisorId" defaultValue={project.supervisorId || ""} className="border rounded px-2 py-1 w-full">
              <option value="">Sin asignar</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <button className="px-3 py-1 rounded bg-blue-600 text-white">Actualizar equipo</button>
          </div>
        </form>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-4">
        <h2 className="text-lg font-semibold">Abonos del cliente</h2>
        <form action={createCarpentryClientPayment} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <input type="hidden" name="projectId" value={project.id} />
          <div>
            <label className="block text-sm text-gray-700">Monto USD</label>
            <input name="amountUSD" type="number" step="0.01" className="border rounded px-2 py-1 w-full" required />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Fecha</label>
            <input name="paidAt" type="date" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Metodo</label>
            <select name="method" className="border rounded px-2 py-1 w-full">
              <option value="">Sin metodo</option>
              <option value="PAGO_MOVIL">Pago movil</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="ZELLE">Zelle</option>
              <option value="EFECTIVO">Efectivo</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Referencia</label>
            <input name="reference" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Notas</label>
            <input name="notes" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm text-gray-700">Comprobante</label>
            <ProofUploader inputName="proofUrl" />
          </div>
          <div>
            <button className="px-3 py-1 rounded bg-green-600 text-white">Registrar abono</button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-1 text-left">Fecha</th>
                <th className="px-2 py-1">Monto</th>
                <th className="px-2 py-1">Metodo</th>
                <th className="px-2 py-1">Referencia</th>
                <th className="px-2 py-1">Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {project.clientPayments.map((p: any) => (
                <tr key={p.id}>
                  <td className="border px-2 py-1">{new Date(p.paidAt).toLocaleDateString()}</td>
                  <td className="border px-2 py-1 text-right">${Number(p.amountUSD).toFixed(2)}</td>
                  <td className="border px-2 py-1 text-center">{p.method || "-"}</td>
                  <td className="border px-2 py-1">{p.reference || "-"}</td>
                  <td className="border px-2 py-1">
                    {p.proofUrl ? <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Ver</a> : "-"}
                  </td>
                </tr>
              ))}
              {!project.clientPayments.length && (
                <tr><td colSpan={5} className="border px-2 py-2 text-center text-gray-500">Sin abonos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-4">
        <h2 className="text-lg font-semibold">Mano de obra / tareas</h2>
        <form action={createCarpentryTask} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="backTo" value={`/dashboard/admin/carpinteria/${project.id}`} />
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Carpintero</label>
            <select name="employeeId" className="border rounded px-2 py-1 w-full" required>
              <option value="">Seleccionar</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Fase</label>
            <select name="phase" className="border rounded px-2 py-1 w-full">
              <option value="">Sin fase</option>
              <option value="FABRICACION">Fabricacion (70%)</option>
              <option value="INSTALACION">Instalacion (30%)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Monto USD</label>
            <input name="amountUSD" type="number" step="0.01" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Fecha</label>
            <input name="workDate" type="date" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Metodo</label>
            <select name="method" className="border rounded px-2 py-1 w-full">
              <option value="">Sin metodo</option>
              <option value="PAGO_MOVIL">Pago movil</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="ZELLE">Zelle</option>
              <option value="EFECTIVO">Efectivo</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Estado</label>
            <select name="status" className="border rounded px-2 py-1 w-full">
              <option value="PENDIENTE">Pendiente</option>
              <option value="EN_PROGRESO">En progreso</option>
              <option value="COMPLETADA">Completada</option>
            </select>
          </div>
          <div className="md:col-span-6">
            <label className="block text-sm text-gray-700">Descripcion</label>
            <input name="description" className="border rounded px-2 py-1 w-full" required />
            <div className="text-xs text-gray-500 mt-1">Monto en 0 solo crea tarea sin pago.</div>
          </div>
          <div className="md:col-span-6">
            <label className="block text-sm text-gray-700">Referencia</label>
            <input name="reference" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-6">
            <button className="px-3 py-1 rounded bg-amber-600 text-white">Agregar tarea</button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-1 text-left">Fecha</th>
                <th className="px-2 py-1">Carpintero</th>
                <th className="px-2 py-1">Fase</th>
                <th className="px-2 py-1">Monto</th>
                <th className="px-2 py-1">Estado</th>
                <th className="px-2 py-1">Descripcion</th>
              </tr>
            </thead>
            <tbody>
              {project.tasks.map((t: any) => (
                <tr key={t.id}>
                  <td className="border px-2 py-1">{new Date(t.workDate).toLocaleDateString()}</td>
                  <td className="border px-2 py-1">{t.employee?.name || "-"}</td>
                  <td className="border px-2 py-1 text-center">{t.phase || "-"}</td>
                  <td className="border px-2 py-1 text-right">${Number(t.amountUSD || 0).toFixed(2)}</td>
                  <td className="border px-2 py-1">
                    <form action={updateCarpentryTaskStatus} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="backTo" value={`/dashboard/admin/carpinteria/${project.id}`} />
                      <select name="status" defaultValue={t.status} className="border rounded px-2 py-1 text-xs">
                        <option value="PENDIENTE">Pendiente</option>
                        <option value="EN_PROGRESO">En progreso</option>
                        <option value="COMPLETADA">Completada</option>
                      </select>
                      <button className="text-xs text-blue-600" type="submit">Guardar</button>
                    </form>
                  </td>
                  <td className="border px-2 py-1">{t.description}</td>
                </tr>
              ))}
              {!project.tasks.length && (
                <tr><td colSpan={6} className="border px-2 py-2 text-center text-gray-500">Sin tareas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-4">
        <h2 className="text-lg font-semibold">Archivos del proyecto</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <CarpentryFileUploader projectId={project.id} fileType="PRESUPUESTO" label="Presupuesto (1 archivo)" max={1} existingCount={countByType("PRESUPUESTO")} />
            <CarpentryFileUploader projectId={project.id} fileType="PLANO" label="Planos (max 2)" max={2} existingCount={countByType("PLANO")} />
            <CarpentryFileUploader projectId={project.id} fileType="CONTRATO" label="Contrato (1 archivo)" max={1} existingCount={countByType("CONTRATO")} />
          </div>
          <div className="space-y-2">
            <CarpentryFileUploader projectId={project.id} fileType="IMAGEN" label="Imagenes del proyecto" />
            <CarpentryFileUploader projectId={project.id} fileType="AVANCE" label="Imagenes de avance" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Archivos cargados</div>
          {project.files.length ? (
            <ul className="text-sm list-disc pl-5">
              {project.files.map((f: any) => (
                <li key={f.id}>
                  <span className="text-xs text-gray-500">[{f.fileType}] </span>
                  <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    {f.filename || f.url}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-gray-500">Sin archivos.</div>
          )}
        </div>
      </section>
    </div>
  );
}
