import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  createCarpentryClientPayment,
  createCarpentrySubproject,
  createCarpentrySubprojectPayment,
  createProductionOrder,
  deleteCarpentrySubproject,
  deleteCarpentryClientPayment,
  getCarpentryProjectById,
  updateCarpentrySubproject,
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
  const subprojects = Array.isArray(project.subprojects) ? project.subprojects : [];

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Subproyectos internos</h2>
            <p className="text-sm text-gray-500 max-w-2xl">
              Divide el presupuesto en subproyectos, lleva el control de abonos y genera órdenes de producción para cada mueble.
            </p>
          </div>
          <span className="text-xs uppercase tracking-[0.3em] text-gray-500">{subprojects.length || 0} subproyectos</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
          <div className="space-y-4">
            {subprojects.length ? (
              subprojects.map((subproject: any) => {
                const fabricationGoal = Number(subproject.totalUSD || 0) * 0.7;
                const installationGoal = Number(subproject.totalUSD || 0) * 0.3;
                const fabricationProgress = fabricationGoal
                  ? Math.min(100, (Number(subproject.fabricationPaidUSD || 0) / fabricationGoal) * 100)
                  : 0;
                const installationProgress = installationGoal
                  ? Math.min(100, (Number(subproject.installationPaidUSD || 0) / installationGoal) * 100)
                  : 0;
                const readyForProduction = Number(subproject.fabricationPaidUSD || 0) >= fabricationGoal;
                return (
                  <article key={subproject.id} className="rounded-2xl border border-gray-200 bg-white p-3 text-sm text-gray-600 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{subproject.name}</h3>
                        {subproject.description && (
                          <p className="text-[11px] text-gray-500">{subproject.description}</p>
                        )}
                      </div>
                      <span className="rounded-full bg-white text-[11px] uppercase tracking-[0.3em] text-gray-500 px-3 py-1 border">
                        {subproject.status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-gray-500 sm:grid-cols-2">
                      <div>
                        <span className="block font-semibold text-gray-900">{formatCurrency(subproject.totalUSD)}</span>
                        <span>Monto total</span>
                      </div>
                      <div>
                        <span className="block font-semibold text-gray-900">{subproject.quantity} piezas</span>
                        <span>Cantidad estimada</span>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 text-[11px] text-gray-500">
                      <div className="flex items-center justify-between">
                        <span>Fabricación</span>
                        <span>{fabricationProgress.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-200">
                        <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${fabricationProgress}%` }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Instalación</span>
                        <span>{installationProgress.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-200">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${installationProgress}%` }} />
                      </div>
                    </div>
                    <div className="mt-3 space-y-3">
                      <details className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                        <summary className="cursor-pointer font-semibold text-gray-700">Registrar abono</summary>
                        <form action={createCarpentrySubprojectPayment} className="mt-3 space-y-2 text-xs">
                          <input type="hidden" name="subprojectId" value={subproject.id} />
                          <input type="hidden" name="returnTo" value={`/dashboard/admin/carpinteria/${project.id}`} />
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <input name="amountUSD" type="number" step="0.01" min="0.01" placeholder="Monto USD" className="rounded border px-2 py-1" required />
                            <select name="phase" className="rounded border px-2 py-1">
                              <option value="FABRICACION">Fabricación</option>
                              <option value="INSTALACION">Instalación</option>
                            </select>
                            <input name="paidAt" type="date" className="rounded border px-2 py-1" />
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <select name="method" className="rounded border px-2 py-1">
                              <option value="">Método</option>
                              <option value="PAGO_MOVIL">Pago móvil</option>
                              <option value="TRANSFERENCIA">Transferencia</option>
                              <option value="ZELLE">Zelle</option>
                              <option value="EFECTIVO">Efectivo</option>
                            </select>
                            <input name="reference" placeholder="Referencia" className="rounded border px-2 py-1" />
                          </div>
                          <textarea name="notes" rows={2} placeholder="Notas (opcional)" className="w-full rounded border px-2 py-1 text-xs" />
                          <div>
                            <label className="text-[11px] font-semibold text-gray-600">Comprobante</label>
                            <ProofUploader inputName="proofUrl" />
                          </div>
                          <button type="submit" className="w-full rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white">
                            Registrar abono
                          </button>
                        </form>
                      </details>
                      <details className="rounded-2xl border border-dashed border-gray-200 bg-white p-3 text-xs text-gray-600">
                        <summary className="cursor-pointer font-semibold text-gray-700">Generar orden de producción</summary>
                        <form action={createProductionOrder} className="mt-3 space-y-2 text-xs">
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="subprojectId" value={subproject.id} />
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input name="number" placeholder="Número de orden" className="rounded border px-2 py-1" required />
                            <select name="phase" className="rounded border px-2 py-1">
                              <option value="">Fase</option>
                              <option value="FABRICACION">Fabricación</option>
                              <option value="INSTALACION">Instalación</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <select name="carpentryLeadId" className="rounded border px-2 py-1">
                              <option value="">Carpintero</option>
                              {employees.map((employee: any) => (
                                <option key={employee.id} value={employee.id}>
                                  {employee.name}
                                </option>
                              ))}
                            </select>
                            <select name="supervisorId" className="rounded border px-2 py-1">
                              <option value="">Supervisor</option>
                              {employees.map((employee: any) => (
                                <option key={employee.id} value={employee.id}>
                                  {employee.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <textarea name="notes" rows={2} placeholder="Notas" className="w-full rounded border px-2 py-1 text-xs" />
                          <button
                            type="submit"
                            disabled={!readyForProduction}
                            className={`w-full rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${
                              readyForProduction ? "bg-blue-600 text-white" : "bg-amber-500 text-white/90"
                            }`}
                          >
                            Crear orden
                          </button>
                          {!readyForProduction && (
                            <p className="text-[10px] text-amber-500">
                              El 70% de fabricación debe estar cubierto para mandar a producir.
                            </p>
                          )}
                        </form>
                      </details>
                      <details className="rounded-2xl border border-dashed border-gray-200 bg-white p-3 text-xs text-gray-600">
                        <summary className="cursor-pointer font-semibold text-gray-700">Editar / eliminar</summary>
                        <form action={updateCarpentrySubproject} className="mt-3 space-y-2 text-xs">
                          <input type="hidden" name="id" value={subproject.id} />
                          <input type="hidden" name="returnTo" value={`/dashboard/admin/carpinteria/${project.id}`} />
                          <input
                            name="name"
                            defaultValue={subproject.name}
                            placeholder="Nombre"
                            className="w-full rounded border px-2 py-1"
                            required
                          />
                          <input
                            name="totalUSD"
                            type="number"
                            step="0.01"
                            min="0.01"
                            defaultValue={Number(subproject.totalUSD || 0)}
                            className="w-full rounded border px-2 py-1"
                            required
                          />
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <input
                              name="quantity"
                              type="number"
                              min="1"
                              defaultValue={Number(subproject.quantity || 1)}
                              className="w-full rounded border px-2 py-1"
                            />
                            <input
                              name="priority"
                              type="number"
                              min="0"
                              defaultValue={Number(subproject.priority || 0)}
                              className="w-full rounded border px-2 py-1"
                            />
                            <select
                              name="status"
                              defaultValue={subproject.status || "PENDIENTE"}
                              className="w-full rounded border px-2 py-1"
                            >
                              <option value="PENDIENTE">Pendiente</option>
                              <option value="FABRICANDO">Fabricando</option>
                              <option value="INSTALANDO">Instalando</option>
                              <option value="COMPLETADO">Completado</option>
                            </select>
                          </div>
                          <textarea
                            name="description"
                            defaultValue={subproject.description || ""}
                            rows={2}
                            placeholder="Descripción"
                            className="w-full rounded border px-2 py-1 text-xs"
                          />
                          <button
                            type="submit"
                            className="w-full rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white"
                          >
                            Guardar cambios
                          </button>
                        </form>
                        <form action={deleteCarpentrySubproject} className="mt-2">
                          <input type="hidden" name="id" value={subproject.id} />
                          <input type="hidden" name="returnTo" value={`/dashboard/admin/carpinteria/${project.id}`} />
                          <button
                            type="submit"
                            className="w-full rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-red-700"
                          >
                            Eliminar subproyecto
                          </button>
                        </form>
                      </details>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 p-3 text-xs text-gray-500">
                No hay subproyectos registrados. Agrega uno a la derecha para comenzar el control.
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">
            <h3 className="text-sm font-semibold text-gray-900">Agregar subproyecto</h3>
            <p className="text-xs text-gray-500">Registra cada mueble o conjunto como un subproyecto independiente.</p>
            <form action={createCarpentrySubproject} className="mt-3 space-y-3 text-xs text-gray-600">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="returnTo" value={`/dashboard/admin/carpinteria/${project.id}`} />
              <div className="space-y-2">
                <input name="name" placeholder="Nombre" className="w-full rounded border px-2 py-1" required />
                <input
                  name="totalUSD"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Monto"
                  className="w-full rounded border px-2 py-1"
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input name="quantity" type="number" min="1" placeholder="Cantidad" className="w-full rounded border px-2 py-1" />
                <input name="priority" type="number" min="0" placeholder="Prioridad" className="w-full rounded border px-2 py-1" />
              </div>
              <textarea name="description" rows={2} placeholder="Descripción" className="w-full rounded border px-2 py-1 text-xs" />
              <label className="inline-flex items-center gap-2 text-[11px] text-gray-500">
                <input type="checkbox" name="includeInBudget" defaultChecked className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                Sumar este monto al presupuesto total
              </label>
              <button type="submit" className="w-full rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white">
                Guardar subproyecto
              </button>
            </form>
          </div>
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
  const formatCurrency = (value: number) => `$${Number(value || 0).toFixed(2)}`;
  const formatDateShort = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };
