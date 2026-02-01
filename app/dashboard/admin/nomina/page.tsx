import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  createPayrollEmployee,
  createPayrollPayment,
  deletePayrollEmployee,
  getPayrollEmployees,
  getPayrollPayments,
  updatePayrollEmployee,
  updatePayrollPaymentDate,
  deletePayrollPayment,
} from "@/server/actions/payroll";
import { createCarpentryTask, getCarpentryProjects, getCarpentryTasks } from "@/server/actions/carpentry";
import { getSettings } from "@/server/actions/settings";

const parseDate = (value?: string | Date | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getWeekBounds = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const day = normalized.getDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  const start = new Date(normalized);
  start.setDate(normalized.getDate() - diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const formatShortDate = (date: Date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
};

const formatFullDate = (date: Date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatUSD = (value: number) => `$${value.toFixed(2)}`;
const formatVES = (value: number) => `Bs ${value.toFixed(2)}`;
const getPaymentDate = (payment: any) =>
  parseDate(payment?.paidAt || payment?.workDate || payment?.createdAt);

export default async function NominaAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{
    message?: string;
    error?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    redirect("/auth/login?callbackUrl=/dashboard/admin/nomina");
  }
  const sessionUser = (session?.user as any) || {};
  const userEmail = String(sessionUser.email || "").toLowerCase();
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  const isRoot = sessionUser.role === "ADMIN" && userEmail === rootEmail;
  const sp = (await searchParams) || ({} as any);
  const message = sp.message ? decodeURIComponent(String(sp.message)) : "";
  const error = sp.error ? decodeURIComponent(String(sp.error)) : "";

  const normalizeParam = (value: string | string[] | undefined | null) => {
    if (Array.isArray(value)) value = value[0];
    if (!value) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
  };

  const filters = {
    startDate: normalizeParam(sp.startDate),
    endDate: normalizeParam(sp.endDate),
  };

  const [employees, payments, projects, tasks, settings] = await Promise.all([
    getPayrollEmployees(),
    getPayrollPayments(filters),
    getCarpentryProjects(),
    getCarpentryTasks(),
    getSettings(),
  ]);
  const tasaVES = Number((settings as any)?.tasaVES || 0) || 0;

  type WeekGroup = {
    key: string;
    start: Date;
    end: Date;
    payments: any[];
    totalUSD: number;
  };

  const weekMap = new Map<string, WeekGroup>();
  payments.forEach((p: any) => {
    const paidAt = getPaymentDate(p);
    if (!paidAt) return;
    const { start, end } = getWeekBounds(paidAt);
    const key = start.toISOString().slice(0, 10);
    let group = weekMap.get(key);
    if (!group) {
      group = { key, start: new Date(start), end: new Date(end), payments: [], totalUSD: 0 };
      weekMap.set(key, group);
    }
    group.payments.push(p);
    group.totalUSD += Number(p.amountUSD || 0);
  });

  const weeklyPayrolls = Array.from(weekMap.values()).sort((a, b) => b.start.getTime() - a.start.getTime());
  weeklyPayrolls.forEach((week) => {
    week.payments.sort((a, b) => {
      const da = getPaymentDate(a) ?? new Date();
      const db = getPaymentDate(b) ?? new Date();
      return db.getTime() - da.getTime();
    });
  });

  const filterStartDate = parseDate(filters.startDate);
  const filterEndDate = parseDate(filters.endDate);
  const filterDateDescription = filterStartDate
    ? filterEndDate
      ? `Mostrando pagos desde ${formatFullDate(filterStartDate)} hasta ${formatFullDate(filterEndDate)}.`
      : `Mostrando pagos desde ${formatFullDate(filterStartDate)}.`
    : filterEndDate
    ? `Mostrando pagos hasta ${formatFullDate(filterEndDate)}.`
    : "";

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nomina</h1>
        <p className="text-sm text-gray-600">
          Control de pagos a empleados fijos, contratados y otros gastos. Los pagos de carpinteria se vinculan a proyectos.
        </p>
      </div>

      {message && <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">{message}</div>}
      {error && <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">{error}</div>}

      <section className="bg-white p-4 rounded-lg shadow space-y-4">
        <h2 className="text-lg font-semibold">Crear empleado</h2>
        <form action={createPayrollEmployee} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Nombre</label>
            <input name="name" className="border rounded px-2 py-1 w-full" required />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Tipo</label>
            <select name="type" className="border rounded px-2 py-1 w-full">
              <option value="FIJA">Nomina fija</option>
              <option value="CONTRATADA">Nomina contratada</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Rol/Servicio</label>
            <input name="role" className="border rounded px-2 py-1 w-full" placeholder="Vigilancia, Carpinteria..." />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Telefono</label>
            <input name="phone" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Pago semanal (USD)</label>
            <input name="weeklySalaryUSD" type="number" step="0.01" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-6">
            <label className="block text-sm text-gray-700">Notas</label>
            <input name="notes" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-6">
            <button className="px-3 py-1 rounded bg-blue-600 text-white">Guardar empleado</button>
          </div>
        </form>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Buscar pagos por fecha</h2>
            <p className="text-sm text-gray-500">Filtra las nóminas registradas por fecha de pago.</p>
          </div>
          {filterDateDescription && <span className="text-xs text-gray-500">{filterDateDescription}</span>}
        </div>
        <form action="/dashboard/admin/nomina" method="get" className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span>Desde</span>
            <input
              name="startDate"
              type="date"
              defaultValue={filters.startDate ?? ""}
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span>Hasta</span>
            <input
              name="endDate"
              type="date"
              defaultValue={filters.endDate ?? ""}
              className="border rounded px-2 py-1"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="px-3 py-1 rounded bg-orange-600 text-white text-sm">
              Aplicar filtros
            </button>
            <a
              href="/dashboard/admin/nomina"
              className="px-3 py-1 rounded border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
            >
              Limpiar
            </a>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Control semanal de nómina</h2>
          <div className="text-xs uppercase tracking-[0.3em] text-orange-600">
            Tasa BCV {tasaVES > 0 ? tasaVES.toFixed(2) : "no registrada"} Bs/USD
          </div>
        </div>
        {weeklyPayrolls.length ? (
          weeklyPayrolls.map((week, index) => {
            const weekLabel = `Semana del ${formatShortDate(week.start)} al ${formatShortDate(week.end)}`;
            const totalVES = week.totalUSD * tasaVES;
            return (
              <details
                key={week.key}
                open={index === 0}
                className="rounded-2xl border border-orange-300 bg-white shadow-sm overflow-hidden"
              >
                <summary className="flex items-center justify-between cursor-pointer px-4 py-3 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-200 text-white text-sm font-semibold">
                  <div>
                    <div>{weekLabel}</div>
                    <div className="text-xs text-orange-100">{formatFullDate(week.start)} – {formatFullDate(week.end)}</div>
                  </div>
                  <div className="text-right text-xs space-y-1">
                    <div>Total USD <span className="font-semibold">{formatUSD(week.totalUSD)}</span></div>
                    <div>Total Bs <span className="font-semibold">{formatVES(totalVES)}</span></div>
                  </div>
                </summary>
                <div className="border-t border-orange-200 bg-white p-4">
                  <div className="overflow-x-auto rounded-lg border border-orange-100 bg-white shadow-inner">
                    <table className="min-w-full text-sm">
                      <thead className="bg-orange-50 text-orange-600 text-xs uppercase">
                        <tr>
                          <th className="px-2 py-1 text-left">Fecha</th>
                          <th className="px-2 py-1 text-left">Empleado</th>
                          <th className="px-2 py-1 text-left">Categoria</th>
                          <th className="px-2 py-1 text-left">Metodo</th>
                          <th className="px-2 py-1 text-left">Servicio</th>
                          <th className="px-2 py-1 text-left">Referencia</th>
                          <th className="px-2 py-1 text-right">Monto USD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {week.payments.map((p) => {
                          const paymentDate = getPaymentDate(p) ?? new Date();
                          const paymentIsoDate = paymentDate.toISOString().slice(0, 10);
                          return (
                            <tr key={`${week.key}-${p.id}`} className="border-b border-orange-100">
                              <td className="px-2 py-1 text-xs text-gray-600">
                                {formatFullDate(paymentDate)}
                                {isRoot && (
                                  <>
                                    <form action={updatePayrollPaymentDate} className="mt-1 flex flex-wrap gap-1 items-center">
                                      <input type="hidden" name="paymentId" value={p.id} />
                                      <input
                                        name="paidAt"
                                        type="date"
                                        defaultValue={paymentIsoDate}
                                        className="border px-2 py-0.5 text-xs rounded text-orange-700"
                                      />
                                      <button
                                        type="submit"
                                        className="text-xs bg-orange-600 text-white rounded px-2 py-0.5"
                                      >
                                        Editar
                                      </button>
                                    </form>
                                    <form action={deletePayrollPayment} className="mt-1">
                                      <input type="hidden" name="paymentId" value={p.id} />
                                      <button
                                        type="submit"
                                        className="text-xs bg-red-600 text-white rounded px-2 py-0.5"
                                      >
                                        Eliminar
                                      </button>
                                    </form>
                                  </>
                                )}
                              </td>
                              <td className="px-2 py-1">{p.employee?.name || "-"}</td>
                              <td className="px-2 py-1">{p.category || "-"}</td>
                              <td className="px-2 py-1">{p.method || "-"}</td>
                              <td className="px-2 py-1">{p.service || p.description || "-"}</td>
                              <td className="px-2 py-1">{p.reference || "-"}</td>
                              <td className="px-2 py-1 text-right font-semibold">
                                {formatUSD(Number(p.amountUSD || 0))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="text-sm font-semibold text-orange-700">
                          <td colSpan={6} className="px-2 py-2 text-right">Total USD semana</td>
                          <td className="px-2 py-2 text-right">{formatUSD(week.totalUSD)}</td>
                        </tr>
                        <tr className="text-xs text-orange-600">
                          <td colSpan={6} className="px-2 py-1 text-right">Equivalente Bs</td>
                          <td className="px-2 py-1 text-right">{formatVES(totalVES)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </details>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
            No hay pagos semanales registrados todavía.
          </div>
        )}
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-semibold">Empleados</h2>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-1 text-left">Nombre</th>
                <th className="px-2 py-1">Tipo</th>
                <th className="px-2 py-1">Rol</th>
                <th className="px-2 py-1">Telefono</th>
                <th className="px-2 py-1">Semanal USD</th>
                <th className="px-2 py-1">Activo</th>
                <th className="px-2 py-1">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e: any) => (
                <tr key={e.id}>
                  <td className="border px-2 py-1">
                    <form action={updatePayrollEmployee} className="flex flex-col gap-1">
                      <input type="hidden" name="id" value={e.id} />
                      <input name="name" defaultValue={e.name} className="border rounded px-2 py-1 w-full" />
                      <input name="notes" defaultValue={e.notes || ""} className="border rounded px-2 py-1 w-full text-xs" placeholder="Notas" />
                      <button className="text-xs text-blue-600 text-left" type="submit">Guardar</button>
                    </form>
                  </td>
                  <td className="border px-2 py-1">
                    <form action={updatePayrollEmployee}>
                      <input type="hidden" name="id" value={e.id} />
                      <select name="type" defaultValue={e.type} className="border rounded px-2 py-1 w-full">
                        <option value="FIJA">Fija</option>
                        <option value="CONTRATADA">Contratada</option>
                      </select>
                      <button className="text-xs text-blue-600" type="submit">Actualizar</button>
                    </form>
                  </td>
                  <td className="border px-2 py-1">
                    <form action={updatePayrollEmployee}>
                      <input type="hidden" name="id" value={e.id} />
                      <input name="role" defaultValue={e.role || ""} className="border rounded px-2 py-1 w-full" />
                      <button className="text-xs text-blue-600" type="submit">Guardar</button>
                    </form>
                  </td>
                  <td className="border px-2 py-1">
                    <form action={updatePayrollEmployee}>
                      <input type="hidden" name="id" value={e.id} />
                      <input name="phone" defaultValue={e.phone || ""} className="border rounded px-2 py-1 w-full" />
                      <button className="text-xs text-blue-600" type="submit">Guardar</button>
                    </form>
                  </td>
                  <td className="border px-2 py-1 text-right">
                    <form action={updatePayrollEmployee}>
                      <input type="hidden" name="id" value={e.id} />
                      <input name="weeklySalaryUSD" type="number" step="0.01" defaultValue={e.weeklySalaryUSD ?? ""} className="border rounded px-2 py-1 w-full text-right" />
                      <button className="text-xs text-blue-600" type="submit">Guardar</button>
                    </form>
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <form action={updatePayrollEmployee}>
                      <input type="hidden" name="id" value={e.id} />
                      <select name="active" defaultValue={String(e.active)} className="border rounded px-2 py-1 w-full">
                        <option value="true">Si</option>
                        <option value="false">No</option>
                      </select>
                      <button className="text-xs text-blue-600" type="submit">Guardar</button>
                    </form>
                  </td>
                  <td className="border px-2 py-1">
                    <form action={deletePayrollEmployee}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="text-red-600 text-xs" type="submit">Eliminar</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!employees.length && (
                <tr><td colSpan={7} className="border px-2 py-2 text-center text-gray-500">Sin empleados registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-4">
        <h2 className="text-lg font-semibold">Registrar pago</h2>
        <form action={createPayrollPayment} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Empleado</label>
            <select name="employeeId" className="border rounded px-2 py-1 w-full">
              <option value="">Sin empleado (otros)</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Categoria</label>
            <select name="category" className="border rounded px-2 py-1 w-full">
              <option value="NOMINA_FIJA">Nomina fija</option>
              <option value="NOMINA_CONTRATADA">Nomina contratada</option>
              <option value="OTRO">Otro pago</option>
            </select>
          </div>
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
            <label className="block text-sm text-gray-700">Servicio / detalle</label>
            <input name="service" className="border rounded px-2 py-1 w-full" placeholder="Flete, vigilancia, etc." />
          </div>
          <div className="md:col-span-6">
            <label className="block text-sm text-gray-700">Descripcion</label>
            <input name="description" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-6">
            <button className="px-3 py-1 rounded bg-green-600 text-white">Guardar pago</button>
          </div>
        </form>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-4">
        <h2 className="text-lg font-semibold">Pago a carpintero (70/30)</h2>
        <form action={createCarpentryTask} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Carpintero</label>
            <select name="employeeId" className="border rounded px-2 py-1 w-full" required>
              <option value="">Seleccionar</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-700">Proyecto</label>
            <select name="projectId" className="border rounded px-2 py-1 w-full">
              <option value="">Sin proyecto</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
            <label className="block text-sm text-gray-700">Descripcion del trabajo</label>
            <input name="description" className="border rounded px-2 py-1 w-full" required />
            <div className="text-xs text-gray-500 mt-1">Monto en 0 solo crea tarea sin pago.</div>
          </div>
          <div className="md:col-span-6">
            <label className="block text-sm text-gray-700">Referencia</label>
            <input name="reference" className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="md:col-span-6">
            <button className="px-3 py-1 rounded bg-amber-600 text-white">Registrar pago carpintero</button>
          </div>
        </form>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-semibold">Ultimos pagos</h2>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-1 text-left">Fecha</th>
                <th className="px-2 py-1">Categoria</th>
                <th className="px-2 py-1">Empleado</th>
                <th className="px-2 py-1">Monto USD</th>
                <th className="px-2 py-1">Metodo</th>
                <th className="px-2 py-1">Referencia</th>
                <th className="px-2 py-1">Servicio</th>
                <th className="px-2 py-1">Proyecto</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id}>
                  <td className="border px-2 py-1">{new Date(p.paidAt).toLocaleDateString()}</td>
                  <td className="border px-2 py-1 text-center">{p.category}</td>
                  <td className="border px-2 py-1">{p.employee?.name || "-"}</td>
                  <td className="border px-2 py-1 text-right">{Number(p.amountUSD).toFixed(2)}</td>
                  <td className="border px-2 py-1 text-center">{p.method || "-"}</td>
                  <td className="border px-2 py-1">{p.reference || "-"}</td>
                  <td className="border px-2 py-1">{p.service || p.description || "-"}</td>
                  <td className="border px-2 py-1">{p.project?.name || "-"}</td>
                </tr>
              ))}
              {!payments.length && (
                <tr><td colSpan={8} className="border px-2 py-2 text-center text-gray-500">Sin pagos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-semibold">Trabajos de carpinteria</h2>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-1 text-left">Fecha</th>
                <th className="px-2 py-1">Carpintero</th>
                <th className="px-2 py-1">Proyecto</th>
                <th className="px-2 py-1">Fase</th>
                <th className="px-2 py-1">Monto USD</th>
                <th className="px-2 py-1">Descripcion</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t: any) => (
                <tr key={t.id}>
                  <td className="border px-2 py-1">{new Date(t.workDate).toLocaleDateString()}</td>
                  <td className="border px-2 py-1">{t.employee?.name}</td>
                  <td className="border px-2 py-1">{t.project?.name || "-"}</td>
                  <td className="border px-2 py-1 text-center">{t.phase || "-"}</td>
                  <td className="border px-2 py-1 text-right">{Number(t.amountUSD).toFixed(2)}</td>
                  <td className="border px-2 py-1">{t.description}</td>
                </tr>
              ))}
              {!tasks.length && (
                <tr><td colSpan={6} className="border px-2 py-2 text-center text-gray-500">Sin trabajos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
