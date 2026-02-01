import { getAllShippedOrders } from "@/server/actions/orders";
import { updateShippingStatusFromAdmin } from "@/server/actions/shipping";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ShippingStatus } from "@prisma/client";
import Link from "next/link";
import { Search, MapPin } from "lucide-react";

const formatDate = (value?: Date | string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "PENDIENTE":
      return "bg-red-100 text-red-800";
    case "ENTREGADO":
      return "bg-green-100 text-green-800";
    case "PREPARANDO":
      return "bg-yellow-100 text-yellow-800";
    case "DESPACHADO":
      return "bg-blue-100 text-blue-800";
    case "EN_TRANSITO":
      return "bg-indigo-100 text-indigo-800";
    case "INCIDENCIA":
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export default async function AdminEnviosPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await getServerSession(authOptions);
  const currentUser = (session?.user as any) || {};
  const role = String(currentUser.role || "").toUpperCase();
  const email = String(currentUser.email || "").toLowerCase();
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  const isRoot = role === "ADMIN" && email === rootEmail;
  const canChangeStatus = role === "DESPACHO" || isRoot;

  const searchQuery = searchParams?.q?.toString() || "";
  const orders = await getAllShippedOrders(searchQuery);

  const statusOptions = Object.values(ShippingStatus) as ShippingStatus[];

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Envíos</h1>
        <Link
          href="/dashboard/admin/envios/mapa"
          className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-amber-700"
        >
          <MapPin className="h-4 w-4" />
          Ver mapa de delivery
        </Link>
      </div>
      <div className="mb-6">
        <form>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="Buscar por cliente, tracking, o ciudad..."
              className="border border-gray-300 rounded-lg px-10 py-2.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </form>
      </div>
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <details className="rounded border border-gray-200 m-4" open>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">Ver envíos</summary>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Pedido</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Transportista</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tracking</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ciudad</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado del Envío</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Fecha entrega</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.length > 0 ? (
                orders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <Link href={`/dashboard/admin/pedidos/${order.id}`} className="text-blue-600 hover:text-blue-800 font-semibold">
                        #{order.id.substring(0, 8)}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.user?.name || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{order.shipping?.carrier || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">{order.shipping?.tracking || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{order.shippingAddress?.city || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex flex-col gap-2">
                        <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusBadgeClass(order.shipping?.status || "PENDIENTE")}`}>
                          {order.shipping?.status || "PENDIENTE"}
                        </span>
                        {canChangeStatus && (
                          <form action={updateShippingStatusFromAdmin} method="post" className="flex flex-wrap gap-2 items-center">
                            <input type="hidden" name="orderId" value={order.id} />
                            <select
                              name="status"
                              defaultValue={order.shipping?.status || "PENDIENTE"}
                              className="border rounded px-3 py-1 text-xs"
                            >
                              {statusOptions.map((statusOption) => (
                                <option key={statusOption} value={statusOption}>
                                  {statusOption}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="px-3 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                              Actualizar
                            </button>
                          </form>
                        )}
                        {!canChangeStatus && (
                          <p className="text-xs text-gray-500">Solo root o despachador puede actualizar el estatus.</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(order.shipping?.deliveryConfirmedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        <Link href={`/dashboard/admin/pedidos/${order.id}`} className="text-blue-600 hover:text-blue-900">Detalles</Link>
                        <a className="text-gray-700 hover:text-gray-900" href={`/api/shipments/${order.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                        {order.user?.phone ? (
                          <a
                            className="text-green-600 hover:text-green-800"
                            href={`https://wa.me/${order.user.phone.replace(/[^0-9]/g,'') || ''}?text=${encodeURIComponent(`Hola ${order.user?.name || ''}, te compartimos los datos de tu envío #${order.id.slice(0,8)}. Transportista: ${order.shipping?.carrier || '-'}; Tracking: ${order.shipping?.tracking || '-'}.
PDF: ${(process.env.NEXT_PUBLIC_URL || '') + '/api/shipments/' + order.id + '/pdf'}`)}`}
                            target="_blank" rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-500">
                    <p className="text-lg">No se encontraron envíos.</p>
                    {searchQuery && <p className="text-sm mt-2">Intenta con otra búsqueda.</p>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </details>
      </div>
    </div>
  );
}
