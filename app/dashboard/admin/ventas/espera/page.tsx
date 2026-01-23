import { authOptions } from "@/lib/auth";
import { getSaleHolds, getSellers, deleteSaleHold } from "@/server/actions/sales";
import { getServerSession } from "next-auth";

export default async function VentasEnEsperaPage({
  searchParams,
}: {
  searchParams?: Promise<{ sellerId?: string; q?: string; message?: string }>;
}) {
  const sp = (await searchParams) || ({} as any);
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const message = String((sp as any).message || "");
  const q = String((sp as any).q || "").trim();
  const sellerIdParam = String((sp as any).sellerId || "");
  const isAdmin = role === "ADMIN";
  const currentSellerId = String((session?.user as any)?.id || "");
  const sellerId = isAdmin ? (sellerIdParam || "") : currentSellerId;

  const [sellers, holds] = await Promise.all([
    getSellers(),
    getSaleHolds({ sellerId: sellerId || undefined, q: q || undefined }),
  ]);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Ventas en espera</h1>
      {message && (
        <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">
          {message}
        </div>
      )}
      <div className="text-sm">
        <a href="/dashboard/admin/ventas/nueva" className="text-blue-600 hover:underline">
          Crear nueva venta
        </a>
      </div>
      <div className="text-xs text-gray-500">
        Las ventas en espera no descuentan inventario hasta que se finalicen.
      </div>

      <form method="get" className="bg-white p-4 rounded-lg shadow grid grid-cols-1 md:grid-cols-5 gap-3">
        {isAdmin && (
          <div>
            <select
              name="sellerId"
              defaultValue={sellerId}
              className="border rounded px-2 py-1 w-full"
            >
              <option value="">Todos los vendedores</option>
              {sellers.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.email}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={isAdmin ? "md:col-span-3" : "md:col-span-4"}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar cliente, email, telefono o RIF"
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <div className="flex gap-2">
          <button className="bg-blue-600 text-white px-3 py-1 rounded">
            Buscar
          </button>
          <a
            href="/dashboard/admin/ventas/espera"
            className="px-3 py-1 rounded border text-gray-700"
          >
            Limpiar
          </a>
        </div>
      </form>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Listado de ventas en espera</h2>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th className="px-2 py-1 text-left">Fecha</th>
                <th className="px-2 py-1 text-left">Cliente</th>
                <th className="px-2 py-1 text-left">Vendedor</th>
                <th className="px-2 py-1 text-right">Items</th>
                <th className="px-2 py-1 text-right">Total USD</th>
                <th className="px-2 py-1 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {holds.map((h: any) => {
                const items = Array.isArray(h.items) ? h.items : [];
                const totalUSD = h.totalUSD != null ? Number(h.totalUSD) : null;
                return (
                  <tr key={h.id} className="border-t">
                    <td className="px-2 py-1 align-top whitespace-nowrap">
                      {new Date(h.updatedAt || h.createdAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 align-top">
                      <div className="font-medium">
                        {h.customerName || h.customerEmail || "Cliente"}
                      </div>
                      <div className="text-xs text-gray-500 break-words">
                        {h.customerEmail || h.customerPhone || ""}
                      </div>
                    </td>
                    <td className="px-2 py-1 align-top">
                      {h.seller ? h.seller.name || h.seller.email : "-"}
                    </td>
                    <td className="px-2 py-1 align-top text-right">
                      {items.length}
                    </td>
                    <td className="px-2 py-1 align-top text-right">
                      {totalUSD != null ? totalUSD.toFixed(2) : "-"}
                    </td>
                    <td className="px-2 py-1 align-top">
                      <div className="flex flex-wrap gap-2">
                        <a
                          className="px-2 py-0.5 border rounded text-blue-700"
                          href={`/dashboard/admin/ventas/nueva?holdId=${h.id}`}
                        >
                          Continuar
                        </a>
                        <form action={deleteSaleHold}>
                          <input type="hidden" name="holdId" value={h.id} />
                          <input type="hidden" name="backTo" value="/dashboard/admin/ventas/espera" />
                          <button type="submit" className="px-2 py-0.5 border rounded text-red-600">
                            Eliminar
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {holds.length === 0 && (
            <div className="text-sm text-gray-500 py-4">No hay ventas en espera.</div>
          )}
        </div>
      </div>
    </div>
  );
}
