import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ProofUploader from "@/components/admin/proof-uploader";
import SupportFileUploader from "@/components/admin/support-file-uploader";
import { getPayrollEmployees } from "@/server/actions/payroll";
import {
  createCarpentryProject,
  createCarpentrySubproject,
  createCarpentrySubprojectPayment,
  createProductionOrder,
  getCarpentrySubprojectProjects,
} from "@/server/actions/carpentry";

type Subproject = {
  id: string;
  name: string;
  description?: string | null;
  totalUSD: number;
  quantity: number;
  fabricationPaidUSD: number;
  installationPaidUSD: number;
  priority: number;
  status: string;
  payments: {
    id: string;
    amountUSD: number;
    phase: string;
    paidAt: string;
    method?: string | null;
    reference?: string | null;
    notes?: string | null;
    proofUrl?: string | null;
  }[];
};

type PartialProject = {
  id: string;
  name: string;
  clientName?: string | null;
  status: string;
  totalAmountUSD: number;
  clientPayments: { amountUSD: number }[];
  files: { url: string; fileType: string; filename?: string | null }[];
  subprojects: Subproject[];
};

export default async function CarpentryPartialPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    redirect("/auth/login?callbackUrl=/dashboard/admin/carpinteria/pagos-parciales");
  }

  const sp = (await searchParams) || ({} as any);
  const message = sp.message ? decodeURIComponent(String(sp.message)) : "";
  const error = sp.error ? decodeURIComponent(String(sp.error)) : "";
  const [projects, employees] = await Promise.all([getCarpentrySubprojectProjects(), getPayrollEmployees()]);

  const formatCurrency = (value: number) => `$${Number(value || 0).toFixed(2)}`;
  const formatDateShort = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString();
  };
  const buildSaleHref = (projectId: string, subprojectId?: string, materialListId?: string) => {
    const params = new URLSearchParams();
    params.set("customerName", "trends172,ca");
    params.set("customerEmail", "root@carpihogar.com");
    params.set("customerPhone", "04245262306");
    params.set("customerTaxId", "J-31758009-5");
    params.set("customerFiscalAddress", "Av Industrial, Edificio Teca, Barinas, Estado Barinas, Venezuela");
    params.set("docType", "recibo");
    params.set("lockDocType", "1");
    if (subprojectId) params.set("carpentrySubprojectId", subprojectId);
    if (materialListId) params.set("carpentryMaterialListId", materialListId);
    params.set("carpentryProjectId", projectId);
    params.set("backTo", `/dashboard/admin/carpinteria/${projectId}`);
    return `/dashboard/admin/ventas/nueva?${params.toString()}`;
  };

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pagos por partes</h1>
        <p className="text-sm text-gray-600">
          Administra presupuestos con subproyectos, registra abonos por mueble y documenta los respaldos de cada pago.
        </p>
      </div>

      {message && <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">{message}</div>}
      {error && <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">{error}</div>}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Nuevo proyecto parcial</p>
          <h2 className="text-2xl font-semibold text-gray-900">Crear expediente con subproyectos</h2>
          <p className="text-sm text-gray-600">
            Elige la modalidad de pago por partes y comienza a desglosar cada mueble o ambiente como un subproyecto independiente.
          </p>
        </div>
        <form
          action={createCarpentryProject}
          className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr,320px]"
        >
          <input type="hidden" name="paymentPlan" value="PARCIAL" />
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700">Nombre del proyecto</label>
              <input name="name" required className="mt-1 w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700">Cliente</label>
              <input name="clientName" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input name="clientCity" placeholder="Ciudad" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
              <input name="clientState" placeholder="Estado" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
              <input name="clientAddress" placeholder="Dirección" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Monto total (USD)</label>
                <input name="totalAmountUSD" type="number" step="0.01" required className="mt-1 w-full rounded border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700">Abono inicial (opcional)</label>
                <input name="initialPaymentUSD" type="number" step="0.01" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input name="initialPaymentReference" placeholder="Referencia" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
              <input name="initialPaymentPaidAt" type="date" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
              <select name="initialPaymentMethod" className="mt-1 w-full rounded border px-3 py-2 text-sm">
                <option value="">Sin método</option>
                <option value="PAGO_MOVIL">Pago móvil</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="ZELLE">Zelle</option>
                <option value="EFECTIVO">Efectivo</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input name="startDate" type="date" className="mt-1 w-full rounded border px-3 py-2 text-sm" placeholder="Fecha estimada de inicio" />
              <input name="endDate" type="date" className="mt-1 w-full rounded border px-3 py-2 text-sm" placeholder="Fecha estimada de entrega" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700">Descripción</label>
              <textarea name="description" rows={3} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Estado del proyecto</label>
                <select name="status" className="mt-1 w-full rounded border px-3 py-2 text-sm">
                  <option value="ACTIVO">Activo</option>
                  <option value="EN_PROCESO">En proceso</option>
                  <option value="CERRADO">Cerrado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700">Costo mano de obra (opcional)</label>
                <input
                  name="laborCostUSD"
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  placeholder="USD"
                />
                <p className="mt-1 text-xs text-gray-500">Si lo defines, se controla con el porcentaje 70/30.</p>
              </div>
            </div>
            <div>
              <button className="w-full rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Crear proyecto parcial
              </button>
            </div>
          </div>
          <div className="space-y-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">¿Qué incluye?</p>
            <ul className="list-disc space-y-1 pl-4 text-[13px]">
              <li>Subdivide el presupuesto en subproyectos con monto propio.</li>
              <li>Registra abonos por cada subproyecto y carga comprobantes.</li>
              <li>Empieza fabricación cuando el 70% del subproyecto esté cubierto.</li>
            </ul>
            <p className="text-xs text-gray-500">
              El sistema llevará un histórico de pagos y te permitirá generar órdenes de producción individuales.
            </p>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Proyectos con subproyectos</h2>
          <span className="text-sm text-gray-500">{projects.length} proyectos</span>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            Aún no hay proyectos activos con esta modalidad. Crea uno arriba para empezar a controlar abonos por subproyecto.
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => {
              const clientPaid = project.clientPayments?.reduce((sum, payment) => sum + Number(payment.amountUSD || 0), 0) || 0;
              const cover = project.files?.find((file) => file.fileType === "IMAGEN")?.url || project.files?.[0]?.url;
              const subprojectTotal = project.subprojects?.reduce(
                (sum, subproject) => sum + Number(subproject.totalUSD || 0),
                0,
              );
              return (
                <article key={project.id} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-lg">
                  <div className="grid gap-4 md:grid-cols-[1fr,280px]">
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold text-gray-900">{project.name}</h3>
                          <p className="text-xs text-gray-500">Cliente: {project.clientName || "Sin nombre"}</p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-600">
                          Pagos por partes
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.3em] text-gray-500">Total proyecto</p>
                          <p className="text-lg font-semibold text-gray-900">{formatCurrency(project.totalAmountUSD)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.3em] text-gray-500">Sumatoria subproyectos</p>
                          <p className="text-lg font-semibold text-gray-900">{formatCurrency(subprojectTotal)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.3em] text-gray-500">Pagado</p>
                          <p className="text-lg font-semibold text-gray-900">{formatCurrency(clientPaid)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.3em] text-gray-500">Saldo pendiente</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {formatCurrency(project.totalAmountUSD - clientPaid)}
                          </p>
                        </div>
                      </div>
                      {cover ? (
                        <img src={cover} alt={project.name} className="h-40 w-full rounded-2xl object-cover" />
                      ) : null}
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                        <span>Estado: {project.status}</span>
                        <span>
                          Creado: {formatDateShort(project.subprojects?.[0]?.payments?.[0]?.paidAt)}
                        </span>
                        <a href={`/dashboard/admin/carpinteria/${project.id}`} className="text-blue-600 hover:underline">
                          Control completo
                        </a>
                      </div>
                    </div>
                    <div className="border-l border-zinc-100 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Soportes</p>
                      <SupportFileUploader projectId={project.id} />
                    </div>
                  </div>

                  <div className="border-t border-zinc-100 p-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">Subproyectos activos</h3>
                        <span className="text-xs text-gray-500">{project.subprojects?.length || 0} registrados</span>
                      </div>
                      <div className="mt-3 space-y-4">
                        {project.subprojects?.length ? (
                          project.subprojects.map((item) => {
                            const listForSubproject = project.materialLists?.find((list) => list.subprojectId === item.id);
                            const subprojectSaleHref = buildSaleHref(project.id, item.id, listForSubproject?.id);
                            const fabricationGoal = Number(item.totalUSD || 0) * 0.7;
                            const installationGoal = Number(item.totalUSD || 0) * 0.3;
                            const fabricationProgress = fabricationGoal
                              ? Math.min(100, (Number(item.fabricationPaidUSD || 0) / fabricationGoal) * 100)
                              : 0;
                            const installationProgress = installationGoal
                              ? Math.min(100, (Number(item.installationPaidUSD || 0) / installationGoal) * 100)
                              : 0;
                            const readyForProduction = Number(item.fabricationPaidUSD || 0) >= fabricationGoal;
                            return (
                              <div key={item.id} className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-base font-semibold text-gray-900">{item.name}</div>
                                    {item.description && (
                                      <p className="text-[11px] text-gray-500">{item.description}</p>
                                    )}
                                  </div>
                                  <span className="rounded-full bg-white px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-600">
                                    {item.status}
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                                    <span>Fabricación</span>
                                    <span>
                                      {formatCurrency(Number(item.fabricationPaidUSD || 0))} / ${fabricationGoal.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-gray-200">
                                    <div
                                      className="h-1.5 rounded-full bg-emerald-400"
                                      style={{ width: `${fabricationProgress}%` }}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                                    <span>Instalación</span>
                                    <span>
                                      {formatCurrency(Number(item.installationPaidUSD || 0))} / ${installationGoal.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-gray-200">
                                    <div
                                      className="h-1.5 rounded-full bg-blue-500"
                                      style={{ width: `${installationProgress}%` }}
                                    />
                                  </div>
                                </div>
                                <details className="rounded-2xl border border-dashed border-gray-200 bg-white p-3 text-xs text-gray-600">
                                  <summary className="cursor-pointer font-semibold text-gray-700">
                                    Registrar abono para este subproyecto
                                  </summary>
                                  <form action={createCarpentrySubprojectPayment} className="mt-3 space-y-3 text-xs">
                                    <input type="hidden" name="subprojectId" value={item.id} />
                                    <input type="hidden" name="returnTo" value="/dashboard/admin/carpinteria/pagos-parciales" />
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                      <input
                                        name="amountUSD"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        placeholder="Monto USD"
                                        className="w-full rounded border px-2 py-1 text-xs"
                                        required
                                      />
                                      <select name="phase" className="w-full rounded border px-2 py-1 text-xs">
                                        <option value="FABRICACION">Fabricación</option>
                                        <option value="INSTALACION">Instalación</option>
                                      </select>
                                      <input name="paidAt" type="date" className="w-full rounded border px-2 py-1 text-xs" />
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      <select name="method" className="w-full rounded border px-2 py-1 text-xs">
                                        <option value="">Método</option>
                                        <option value="PAGO_MOVIL">Pago móvil</option>
                                        <option value="TRANSFERENCIA">Transferencia</option>
                                        <option value="ZELLE">Zelle</option>
                                        <option value="EFECTIVO">Efectivo</option>
                                      </select>
                                      <input name="reference" placeholder="Referencia" className="w-full rounded border px-2 py-1 text-xs" />
                                    </div>
                                    <textarea
                                      name="notes"
                                      rows={2}
                                      placeholder="Notas (opcional)"
                                      className="w-full rounded border px-2 py-1 text-xs"
                                    />
                                    <div>
                                      <label className="text-[11px] font-semibold text-gray-600">Comprobante</label>
                                      <ProofUploader inputName="proofUrl" />
                                    </div>
                                    <button
                                      type="submit"
                                      className="w-full rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white"
                                    >
                                      Registrar abono
                                    </button>
                                  </form>
                                </details>
                                <div className="space-y-2">
                                  {item.payments.length ? (
                                    item.payments.map((payment) => (
                                      <div key={payment.id} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600">
                                        <div className="flex items-center justify-between">
                                          <span className="font-semibold text-gray-900">{formatCurrency(Number(payment.amountUSD || 0))}</span>
                                          <span className="text-[10px] uppercase tracking-[0.3em] text-gray-500">{payment.phase}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-500">
                                          {formatDateShort(payment.paidAt)} · {payment.method || "Sin método"}
                                        </div>
                                        {payment.reference && (
                                          <div className="text-[10px] text-gray-500">Ref. {payment.reference}</div>
                                        )}
                                        {payment.notes && (
                                          <div className="text-[10px] text-gray-500">{payment.notes}</div>
                                        )}
                                        {payment.proofUrl && (
                                          <a
                                            href={payment.proofUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-600 hover:underline"
                                          >
                                            Ver comprobante
                                          </a>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-[11px] text-gray-500">Sin abonos registrados.</div>
                                  )}
                              </div>
                                <div className="flex justify-end">
                                  <Link
                                    href={subprojectSaleHref}
                                    className="rounded-full border border-blue-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-600 transition hover:bg-blue-50"
                                  >
                                    Comprar materiales
                                  </Link>
                                </div>
                              <details
                                className="rounded-2xl border border-dashed border-gray-200 bg-white p-3 text-xs text-gray-600"
                              >
                                  <summary className="cursor-pointer font-semibold text-gray-700">
                                    Crear orden de producción
                                  </summary>
                                  <form action={createProductionOrder} className="mt-3 space-y-3 text-xs">
                                    <input type="hidden" name="projectId" value={project.id} />
                                    <input type="hidden" name="subprojectId" value={item.id} />
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      <input
                                        name="number"
                                        placeholder="Número orden"
                                        className="w-full rounded border px-2 py-1 text-xs"
                                        required
                                      />
                                      <select name="phase" className="w-full rounded border px-2 py-1 text-xs">
                                        <option value="">Fase</option>
                                        <option value="FABRICACION">Fabricación</option>
                                        <option value="INSTALACION">Instalación</option>
                                      </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <select name="carpentryLeadId" className="w-full rounded border px-2 py-1 text-xs">
                                        <option value="">Carpintero</option>
                                        {employees.map((employee) => (
                                          <option key={employee.id} value={employee.id}>
                                            {employee.name}
                                          </option>
                                        ))}
                                      </select>
                                      <select name="supervisorId" className="w-full rounded border px-2 py-1 text-xs">
                                        <option value="">Supervisor</option>
                                        {employees.map((employee) => (
                                          <option key={employee.id} value={employee.id}>
                                            {employee.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      <input
                                        name="scheduledStart"
                                        type="date"
                                        className="w-full rounded border px-2 py-1 text-xs"
                                        placeholder="Inicio"
                                      />
                                      <input
                                        name="scheduledEnd"
                                        type="date"
                                        className="w-full rounded border px-2 py-1 text-xs"
                                        placeholder="Fin"
                                      />
                                    </div>
                                    <textarea
                                      name="notes"
                                      rows={2}
                                      placeholder="Notas específicas"
                                      className="w-full rounded border px-2 py-1 text-xs"
                                    />
                                    <button
                                      type="submit"
                                      className={`w-full rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${
                                        readyForProduction
                                          ? "bg-emerald-600 text-white"
                                          : "bg-amber-500 text-white/90"
                                      }`}
                                    >
                                      Crear orden
                                    </button>
                                    {!readyForProduction && (
                                      <p className="text-[10px] text-amber-500">
                                        Necesitas cubrir al menos el 70% para iniciar la producción.
                                      </p>
                                    )}
                                  </form>
                                </details>
                              </div>
                            );
                          })
                        ) : (
                          <div className="rounded-2xl border border-dashed border-gray-200 p-3 text-xs text-gray-500">
                            Aún no hay subproyectos registrados en este proyecto.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 pt-4">
                      <h3 className="text-sm font-semibold text-gray-900">Agregar subproyecto</h3>
                      <form action={createCarpentrySubproject} className="mt-3 space-y-3 text-xs text-gray-600">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="returnTo" value="/dashboard/admin/carpinteria/pagos-parciales" />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <input name="name" placeholder="Nombre" className="w-full rounded border px-2 py-1" required />
                          <input
                            name="totalUSD"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="Monto total"
                            className="w-full rounded border px-2 py-1"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <input name="quantity" type="number" min="1" placeholder="Cantidad" className="w-full rounded border px-2 py-1" />
                          <input name="priority" type="number" min="0" placeholder="Prioridad" className="w-full rounded border px-2 py-1" />
                        </div>
                        <textarea name="description" rows={2} placeholder="Descripción" className="w-full rounded border px-2 py-1 text-xs" />
                        <label className="inline-flex items-center gap-2 text-[11px] text-gray-500">
                          <input type="checkbox" name="includeInBudget" defaultChecked className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                          Sumar este monto al presupuesto total
                        </label>
                        <button
                          type="submit"
                          className="w-full rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white"
                        >
                          Guardar subproyecto
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
