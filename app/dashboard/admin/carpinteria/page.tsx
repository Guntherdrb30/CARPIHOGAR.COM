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
import CarpentryProjectTabs from "@/components/admin/carpentry-project-tabs";
import CarpentryDocumentUploader from "@/components/admin/carpentry-document-uploader";
import CarpentryClientLocationFields from "@/components/admin/carpentry-client-location-fields";

export default async function CarpinteriaAdminPage({ searchParams }: { searchParams?: Promise<{ message?: string; error?: string }> }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    redirect("/auth/login?callbackUrl=/dashboard/admin/carpinteria");
  }
  const email = String((session?.user as any)?.email || "").toLowerCase();
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  const isRoot = String((session?.user as any)?.role || "") === "ADMIN" && email && email === rootEmail;
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

      <section className="space-y-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Crear proyecto</p>
            <h2 className="text-2xl font-semibold text-gray-900">Nuevo expediente de carpintería</h2>
            <p className="text-sm text-gray-600">
              Completa todos los datos obligatorios, sube planos/render, lista de materiales y podrás generar
              órdenes de compra directamente desde cada proyecto.
            </p>
          </div>
          <form action={createCarpentryProject} className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr,320px]">
            <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Nombre del proyecto</label>
                <input name="name" required className="mt-1 w-full rounded border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700">Cliente</label>
                <input name="clientName" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700">Modelo de pago</label>
              <select
                name="paymentPlan"
                defaultValue="ESTANDAR"
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              >
                <option value="ESTANDAR">Pago 70% / 30% (estándar)</option>
                <option value="PARCIAL">Pagos por partes (nuevo control)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                El modo estándar requiere abonar el 70% para comenzar; el modo pagos por partes te permite seleccionar muebles e ir registrando abonos específicos.
              </p>
            </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <CarpentryClientLocationFields />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Monto total (USD)</label>
                  <input name="totalAmountUSD" type="number" step="0.01" required className="mt-1 w-full rounded border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Pago inicial (USD)</label>
                  <input name="initialPaymentUSD" type="number" step="0.01" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Método de pago</label>
                  <select name="initialPaymentMethod" className="mt-1 w-full rounded border px-3 py-2 text-sm">
                    <option value="">Sin método</option>
                    <option value="PAGO_MOVIL">Pago móvil</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="ZELLE">Zelle</option>
                    <option value="EFECTIVO">Efectivo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Fecha de pago</label>
                  <input name="initialPaymentPaidAt" type="date" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Carpintero</label>
                  <select name="carpenterId" className="mt-1 w-full rounded border px-3 py-2 text-sm">
                    <option value="">Sin asignar</option>
                    {employees.map((e: any) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Arquitecto</label>
                  <select name="architectId" className="mt-1 w-full rounded border px-3 py-2 text-sm">
                    <option value="">Sin asignar</option>
                    {employees.map((e: any) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Supervisor</label>
                  <select name="supervisorId" className="mt-1 w-full rounded border px-3 py-2 text-sm">
                    <option value="">Sin asignar</option>
                    {employees.map((e: any) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Inicio estimado</label>
                  <input name="startDate" type="date" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Fin estimado</label>
                  <input name="endDate" type="date" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700">Descripción</label>
                <textarea name="description" rows={3} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Estado del proyecto</label>
                  <select name="status" className="mt-1 w-full rounded border px-3 py-2 text-sm">
                    <option value="ACTIVO">Activo</option>
                    <option value="EN_PROCESO">En proceso</option>
                    <option value="CERRADO">Cerrado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Pago por fase completa (70%)</label>
                  <input name="secretToken" placeholder="Clave secreta (opcional)" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Documentación</p>
                <p className="text-sm text-gray-800">
                  Adjunta presupuesto, renders, comprobantes y lista de materiales para que el expediente esté completo desde el inicio.
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <CarpentryDocumentUploader
                    fieldName="budgetFiles"
                    label="Presupuesto inicial (PDF)"
                    description="Solo se permite un archivo. Este será la base del total del proyecto."
                    accept="application/pdf"
                    fileType="PRESUPUESTO"
                    max={1}
                  />
                  <CarpentryDocumentUploader
                    fieldName="renderFiles"
                    label="Renders / imágenes del proyecto"
                    description="Sube hasta 4 renders; la primera imagen registrada se usará como portada en la tarjeta del proyecto."
                    accept="image/*"
                    fileType="IMAGEN"
                    max={4}
                  />
                  <CarpentryDocumentUploader
                    fieldName="paymentProofFiles"
                    label="Comprobantes de abonos"
                    description="Adjunta comprobantes adicionales para respaldar pagos del cliente."
                    accept="image/*,application/pdf"
                    fileType="AVANCE"
                    max={4}
                  />
                  <div className="space-y-2">
                    <CarpentryDocumentUploader
                      fieldName="materialsFiles"
                      label="Lista de materiales (PDF/Excel)"
                      description="Sube el archivo que detalla los materiales del proyecto."
                      accept="application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      fileType="OTRO"
                      max={1}
                    />
                    <div>
                      <label className="block text-xs font-semibold text-gray-500">Nombre para la lista</label>
                      <input
                        name="materialsListName"
                        placeholder="Lista de materiales inicial"
                        className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-gray-500">
                  Los renders cargados serán visibles en la tarjeta del proyecto; asegúrate de que el primero sea el más representativo.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Control financiero</p>
                <p className="text-sm text-gray-800">Cuando el cliente haya pagado al menos el 70% puedes generar órdenes de compra desde el detalle.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase text-emerald-600">70% pago requerido</span>
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-semibold uppercase text-blue-600">Compras integradas</span>
                </div>
              </div>
              <div className="pt-2">
                <button className="w-full rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  Guardar proyecto
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Proyectos</h2>
          <span className="text-sm text-gray-500">{projects.length} proyectos</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((projectItem: any) => {
            const planLabel =
              projectItem.paymentPlan === "PARCIAL"
                ? "Pagos por partes"
                : "Pago 70% / 30% (estándar)";
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
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{projectItem.name}</h3>
                      <p className="text-[11px] text-gray-400">{planLabel}</p>
                    </div>
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
                    {Number((projectItem as any)?._count?.purchaseOrders || 0) === 0 && (
                      <form action={deleteCarpentryProject}>
                        <input type="hidden" name="id" value={projectItem.id} />
                        <button
                          type="submit"
                          disabled={!isRoot}
                          title={isRoot ? "Eliminar proyecto" : "Solo ROOT puede eliminar proyectos"}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${
                            isRoot
                              ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              : "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
                          }`}
                        >
                          Eliminar
                        </button>
                      </form>
                    )}
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
