import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  createCarpentryClientPayment,
  deleteCarpentryClientPayment,
  getCarpentryProjectById,
  updateCarpentryProject,
} from "@/server/actions/carpentry";
import { getPayrollEmployees } from "@/server/actions/payroll";
import CarpentryFileUploader from "@/components/admin/carpentry-file-uploader";
import ProofUploader from "@/components/admin/proof-uploader";
import SupportFileUploader from "@/components/admin/support-file-uploader";
import CarpentryProjectTabs from "@/components/admin/carpentry-project-tabs";
import CarpentryProgressForm from "@/components/admin/carpentry-progress-form";

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

  const countByType = (type: string) => project.files.filter((f: any) => f.fileType === type).length;
  const supportFiles = project.files.filter((f: any) => f.fileType === "SOPORTE");
  const updates = Array.isArray(project.updates) ? project.updates : [];

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

      <CarpentryProjectTabs project={project} employees={employees} />

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
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Costo mano de obra USD</label>
            <input
              name="laborCostUSD"
              type="number"
              step="0.01"
              defaultValue={project.laborCostUSD ?? ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="Monto a controlar con porcentaje 70/30"
            />
            <p className="text-xs text-gray-500 mt-1">
              Este valor es el presupuesto fijo de mano de obra; el sistema divide automáticamente 70% para fabricación y 30% para instalación cuando registra pagos a carpinteros.
            </p>
          </div>
        </form>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Avances del proyecto</h2>
            <p className="text-sm text-gray-500 max-w-2xl">
              Documenta cada avance con descripción, fecha, fase y responsable. Puedes adjuntar una imagen del avance para tener evidencia visual.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr),320px] gap-4">
          <div className="space-y-3">
            {updates.length ? (
              updates.map((update: any) => (
                <article key={update.id} className="rounded border border-gray-200 p-3 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.3em] text-gray-500">
                    <span>{update.phase || "Fase"}</span>
                    <span>{new Date(update.progressDate).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-700">{update.description}</p>
                  {update.imageUrl && (
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <img src={update.imageUrl} alt="Avance" className="max-h-40 w-full object-cover" />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between text-xs text-gray-500">
                    <span>Responsable: {update.responsible?.name || "Sin especificar"}</span>
                    <span>Cargado por: {update.createdBy?.name || "Admin"}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="text-xs text-gray-500">Aún no hay avances registrados.</div>
            )}
          </div>
          <CarpentryProgressForm projectId={project.id} employees={employees} />
        </div>
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
              <th className="px-2 py-1">Acción</th>
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
                  <td className="border px-2 py-1">
                    <form action={deleteCarpentryClientPayment} method="post">
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-xs font-semibold uppercase tracking-[0.3em] text-red-600 hover:text-red-800">
                        Eliminar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!project.clientPayments.length && (
                <tr><td colSpan={6} className="border px-2 py-2 text-center text-gray-500">Sin abonos</td></tr>
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
                  {f.description && (
                    <div className="text-xs text-gray-500">{f.description}</div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-gray-500">Sin archivos.</div>
          )}
        </div>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Soportes del proyecto</h2>
            <p className="text-xs text-gray-500 max-w-2xl">
              Agrega archivos en PDF o Excel con una breve descripción para documentar entregables, listas de materiales 
              o respaldo técnico. Puedes subir tantos como necesites.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-4">
          <div className="space-y-3">
            {supportFiles.length ? (
              supportFiles.map((file: any) => (
                <div key={file.id} className="rounded border border-gray-200 p-3 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <a href={file.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                      {file.filename || "Soporte sin nombre"}
                    </a>
                    <span className="text-[11px] text-gray-500 uppercase tracking-[0.2em]">
                      {String(file.fileType || "SOPORTE")}
                    </span>
                  </div>
                  {file.description && (
                    <div className="text-xs text-gray-600">{file.description}</div>
                  )}
                  <div className="text-[11px] text-gray-500">
                    Cargado el {file.createdAt ? new Date(file.createdAt).toLocaleDateString() : "—"}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-500">
                Aún no hay soportes registrados para este proyecto.
              </div>
            )}
          </div>
          <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
            <SupportFileUploader projectId={project.id} />
          </div>
        </div>
      </section>
    </div>
  );
}
