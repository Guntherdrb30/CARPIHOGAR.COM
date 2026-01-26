
import { getAllOrders } from "@/server/actions/orders";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBranches, createBranchAction } from "@/server/actions/branches";
import BranchLocationFields from "@/components/admin/branch-location-fields";
import Kitchen3DAdminPanel from "@/components/admin/Kitchen3DAdminPanel";
import prisma from "@/lib/prisma";

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  if (!session?.user || role !== "ADMIN") {
    redirect("/auth/login?callbackUrl=/dashboard/admin");
  }

  const [orders, branches, modules] = await Promise.all([
    getAllOrders(),
    getBranches(),
    prisma.product.findMany({
      where: {
        productFamily: "KITCHEN_MODULE",
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        images: true,
        kitchenCategory: true,
        sku: true,
        code: true,
      },
    }),
  ]);

  const totalSales = orders.reduce(
    (acc, order) => acc + Number(order.totalUSD || 0),
    0,
  );
  const pendingPayment = orders.filter(
    (order) => order.status === "PENDIENTE",
  ).length;
  const shipped = orders.filter(
    // considera tanto ENVIADO como COMPLETADO como "enviados"
      (order) =>
        order.status === "ENVIADO" ||
        order.status === "COMPLETADO" ||
        order.status === "PAGADO",
  ).length;
  const fieldClass =
    "w-full rounded-2xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400";

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-black opacity-70" />
      <div className="relative space-y-6">
        <section className="rounded-3xl border border-white/20 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6 text-white shadow-2xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.45em] text-emerald-300">Notificaciones</p>
              <h1 className="text-3xl font-bold sm:text-4xl">Dashboard de Administrador</h1>
              <p className="text-sm text-white/70 max-w-2xl">
                Revisa lo urgente, controla las ventas y mantén alineados los equipos de operaciones desde una sola vista.
              </p>
            </div>
            <a
              href="/dashboard/admin/notificaciones"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/20"
            >
              Ver notificaciones
            </a>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Ventas totales</p>
              <p className="mt-3 text-3xl font-semibold">${totalSales.toFixed(2)}</p>
              <p className="text-xs text-white/60 mt-1">{shipped} órdenes enviadas</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Pagos pendientes</p>
              <p className="mt-3 text-3xl font-semibold">{pendingPayment}</p>
              <p className="text-xs text-white/60 mt-1">{salesPending} pagos por revisar</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Mensajería activa</p>
              <p className="mt-3 text-3xl font-semibold">{unreadMsgs}</p>
              <p className="text-xs text-white/60 mt-1">Chats y tickets sin leer</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Laboratorio 3D</p>
              <h2 className="text-2xl font-semibold">Módulos para diseñar cocinas</h2>
              <p className="text-sm text-white/70">
                Visualiza los módulos activos y genera piezas directamente desde el panel con la tecnología del configurador.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-white/60">{modules.length} módulos listos</span>
          </div>
          <div className="mt-6">
            <Kitchen3DAdminPanel modules={modules} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Sucursales registradas</h2>
              <span className="text-xs uppercase tracking-[0.3em] text-white/70">{branches.length} en total</span>
            </div>
            {branches.length === 0 ? (
              <p className="text-sm text-white/60">
                Todavía no hay sucursales creadas. Completa el formulario para agregar la primera.
              </p>
            ) : (
              <ul className="space-y-3">
                {branches.slice(0, 4).map((branch) => (
                  <li key={branch.id} className="space-y-2 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-white">{branch.name}</div>
                      {!branch.isActive && (
                        <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-200">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/70">
                      {branch.city}, {branch.state} — {branch.code}
                    </div>
                    <div className="text-xs text-white/60">
                      Moto ${branch.motoRatePerKmUSD ?? "-"} · Carro ${branch.carRatePerKmUSD ?? "-"} · Camioneta $
                      {branch.vanRatePerKmUSD ?? "-"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {branches.length > 4 && (
              <a href="/dashboard/admin/sucursales" className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-300 hover:text-emerald-200">
                Ver todas las sucursales
              </a>
            )}
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Crear nueva sucursal</h2>
              <p className="text-sm text-white/70">Registra ubicaciones y tarifas para los equipos de delivery.</p>
            </div>
            <form action={createBranchAction} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input name="name" placeholder="Nombre" required className={fieldClass} />
                <input
                  name="code"
                  placeholder="Código"
                  required
                  className={`${fieldClass} uppercase`}
                />
              </div>
              <BranchLocationFields />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <input
                  name="motoRatePerKmUSD"
                  type="number"
                  step="0.01"
                  placeholder="Tarifa moto"
                  className={fieldClass}
                />
                <input
                  name="carRatePerKmUSD"
                  type="number"
                  step="0.01"
                  placeholder="Tarifa carro"
                  className={fieldClass}
                />
                <input
                  name="vanRatePerKmUSD"
                  type="number"
                  step="0.01"
                  placeholder="Tarifa camioneta"
                  className={fieldClass}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  name="motoMinFeeUSD"
                  type="number"
                  step="0.01"
                  placeholder="Mínimo moto"
                  className={fieldClass}
                />
                <input
                  name="vanMinFeeUSD"
                  type="number"
                  step="0.01"
                  placeholder="Mínimo camioneta"
                  className={fieldClass}
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-white/30 bg-white/5 text-emerald-400" />
                Activa
              </label>
              <div>
                <button className="w-full rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition hover:bg-emerald-400">
                  Guardar sucursal
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl">
          <div className="text-xs font-semibold uppercase tracking-[0.4em] text-white/70">Operaciones clave</div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <a
              href="/dashboard/admin/mensajeria"
              className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Mensajería</p>
              <p className="mt-2 text-lg font-semibold">Revisa chats y tickets</p>
              <p className="text-sm text-white/60">{unreadMsgs} conversaciones sin leer</p>
            </a>
            <a
              href="/dashboard/admin/reportes"
              className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Reportes</p>
              <p className="mt-2 text-lg font-semibold">Descarga KPIs</p>
              <p className="text-sm text-white/60">Ventas, inventario y operaciones en un PDF.</p>
            </a>
            <a
              href="/dashboard/admin/ajustes"
              className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Ajustes</p>
              <p className="mt-2 text-lg font-semibold">Configura el sistema</p>
              <p className="text-sm text-white/60">Pagos, usuarios, tienda y vistas root.</p>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
