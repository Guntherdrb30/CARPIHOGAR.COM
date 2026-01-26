import { useMemo } from "react";
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
import CarpentryProjectTabs from "@/components/admin/carpentry-project-tabs";

const VENEZUELA_STATES = [
  "Amazonas",
  "Anzoátegui",
  "Apure",
  "Aragua",
  "Barinas",
  "Bolívar",
  "Carabobo",
  "Cojedes",
  "Delta Amacuro",
  "Distrito Capital",
  "Falcón",
  "Guárico",
  "Lara",
  "Mérida",
  "Miranda",
  "Monagas",
  "Nueva Esparta",
  "Portuguesa",
  "Sucre",
  "Táchira",
  "Trujillo",
  "Vargas",
  "Yaracuy",
  "Zulia",
];

const CITY_MAP: Record<string, string[]> = {
  Distrito: ["Caracas", "El Hatillo", "Chacao"],
  Miranda: ["Guatire", "Los Teques", "Higuerote"],
  Carabobo: ["Valencia", "Naguanagua", "Puerto Cabello"],
  Lara: ["Barquisimeto", "Cabudare", "Carora"],
  Zulia: ["Maracaibo", "Cabimas", "San Francisco"],
  default: ["Maracay", "Puerto Ordaz", "Ciudad Bolívar"],
};

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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Ciudad</label>
                  <input
                    name="clientCity"
                    list="carpentry-cities"
                    placeholder="Caracas"
                    className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  />
                  <datalist id="carpentry-cities">
                    {["Caracas", "Valencia", "Maracay", "Maracaibo", "Barquisimeto"].map((city) => (
                      <option key={city} value={city} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Estado</label>
                  <select name="clientState" className="mt-1 w-full rounded border px-3 py-2 text-sm">
                    <option value="">Selecciona un estado</option>
                    {VENEZUELA_STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Dirección</label>
                  <input name="clientAddress" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
                </div>
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
                <p className="text-sm text-gray-800">Adjunta planos iniciales, renders y contratos.</p>
                <div className="space-y-2 pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500">Comprobante inicial</label>
                    <ProofUploader inputName="initialPaymentProofUrl" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500">Planos / renders</label>
                    <ProofUploader inputName="projectDrawingsUrl" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500">Lista de materiales (PDF/Excel)</label>
                    <ProofUploader inputName="materialsListUrl" />
                  </div>
                </div>
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
