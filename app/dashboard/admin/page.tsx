
import { getAllOrders } from "@/server/actions/orders";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBranches, createBranchAction } from "@/server/actions/branches";
import BranchLocationFields from "@/components/admin/branch-location-fields";

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  if (!session?.user || role !== "ADMIN") {
    redirect("/auth/login?callbackUrl=/dashboard/admin");
  }

  const [orders, branches] = await Promise.all([getAllOrders(), getBranches()]);

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

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Dashboard de Administrador</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold">Ventas Totales</h2>
          <p className="text-3xl">${totalSales.toFixed(2)}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold">Pendientes de Pago</h2>
          <p className="text-3xl">{pendingPayment}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold">Enviados</h2>
          <p className="text-3xl">{shipped}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sucursales registradas</h2>
            <span className="text-sm text-gray-500">{branches.length} en total</span>
          </div>
          {branches.length === 0 ? (
            <p className="text-sm text-gray-500">
              Todavia no hay sucursales creadas. Completa el formulario para agregar la primera.
            </p>
          ) : (
            <ul className="space-y-3">
              {branches.slice(0, 4).map((branch) => (
                <li key={branch.id} className="border rounded px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900">{branch.name}</div>
                    {!branch.isActive && (
                      <span className="text-[11px] font-semibold text-amber-700 border border-amber-200 bg-amber-50 rounded-full px-2 py-0.5">
                        Inactiva
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {branch.city}, {branch.state} - {branch.code}
                  </div>
                  <div className="text-xs text-gray-500">
                    Moto ${branch.motoRatePerKmUSD ?? "-"} - Carro ${branch.carRatePerKmUSD ?? "-"} - Camioneta $
                    {branch.vanRatePerKmUSD ?? "-"}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {branches.length > 4 && (
            <a href="/dashboard/admin/sucursales" className="text-sm text-blue-600 underline">
              Ver todas las sucursales
            </a>
          )}
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Crear nueva sucursal</h2>
          <form action={createBranchAction} className="space-y-3 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input name="name" placeholder="Nombre" required className="border rounded px-3 py-2" />
              <input
                name="code"
                placeholder="Codigo"
                required
                className="border rounded px-3 py-2 uppercase"
              />
            </div>
            <BranchLocationFields />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                name="motoRatePerKmUSD"
                type="number"
                step="0.01"
                placeholder="Tarifa moto"
                className="border rounded px-3 py-2"
              />
              <input
                name="carRatePerKmUSD"
                type="number"
                step="0.01"
                placeholder="Tarifa carro"
                className="border rounded px-3 py-2"
              />
              <input
                name="vanRatePerKmUSD"
                type="number"
                step="0.01"
                placeholder="Tarifa camioneta"
                className="border rounded px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                name="motoMinFeeUSD"
                type="number"
                step="0.01"
                placeholder="Minimo moto"
                className="border rounded px-3 py-2"
              />
              <input
                name="vanMinFeeUSD"
                type="number"
                step="0.01"
                placeholder="Minimo camioneta"
                className="border rounded px-3 py-2"
              />
            </div>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="isActive" defaultChecked />
              Activa
            </label>
            <div>
              <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm font-semibold">
                Guardar sucursal
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
