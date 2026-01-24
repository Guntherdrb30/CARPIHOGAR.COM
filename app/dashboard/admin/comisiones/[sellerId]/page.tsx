import Link from 'next/link';
import {
  getSellerCommissionOverview,
  getSellerSalesByFilters,
  updateSellerCommissionByForm,
} from '@/server/actions/commissions';

export default async function AdminCommissionsSellerPage({
  params,
  searchParams,
}: {
  params: Promise<{ sellerId: string }>;
  searchParams?: Promise<{
    message?: string;
    error?: string;
    invoice?: string;
    cliente?: string;
    monto?: string;
  }>;
}) {
  const { sellerId } = await params;
  const sp = (await searchParams) || {};

  const message = String(sp.message || '');
  const error = String(sp.error || '');
  const invoiceQ = String(sp.invoice || '').trim();
  const clienteQ = String(sp.cliente || '').trim();
  const montoQ = String(sp.monto || '').trim();

  const [overview, orders] = await Promise.all([
    getSellerCommissionOverview(sellerId),
    getSellerSalesByFilters({
      sellerId,
      invoice: invoiceQ || undefined,
      customer: clienteQ || undefined,
      amount: montoQ || undefined,
      take: 20,
    }),
  ]);

  const sellerName = overview.seller.name || overview.seller.email || 'Vendedor';

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Comisiones - {sellerName}</h1>
          <div className="text-sm text-gray-600">{overview.seller.email}</div>
        </div>
        <Link href="/dashboard/admin/comisiones" className="px-3 py-1 rounded border">
          Volver
        </Link>
      </div>

      {message && (
        <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">
          {message}
        </div>
      )}
      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="bg-white p-4 rounded-lg shadow space-y-2">
        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
          <div>Total ventas: ${overview.totals.totalSalesUSD.toFixed(2)}</div>
          <div>Total comisiones: ${overview.totals.totalCommissionUSD.toFixed(2)}</div>
          <div>Ventas registradas: {overview.totals.salesCount}</div>
          <div>Comision default: {overview.defaultCommissionPercent.toFixed(2)}%</div>
        </div>
        <form action={updateSellerCommissionByForm} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="sellerId" value={overview.seller.id} />
          <input type="hidden" name="backTo" value={`/dashboard/admin/comisiones/${overview.seller.id}`} />
          <label className="text-sm text-gray-700">Comision %</label>
          <input
            name="commissionPercent"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={overview.seller.commissionPercent ?? ''}
            placeholder={overview.defaultCommissionPercent.toFixed(2)}
            className="border rounded px-2 py-1 w-24"
          />
          <button className="px-2 py-1 rounded border text-gray-700">Guardar</button>
          <span className="text-xs text-gray-500">Deja vacio para usar default.</span>
        </form>
      </div>

      <form method="get" className="bg-white p-4 rounded-lg shadow grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <input
            name="invoice"
            defaultValue={invoiceQ}
            placeholder="Factura u orden"
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <div>
          <input
            name="cliente"
            defaultValue={clienteQ}
            placeholder="Cliente (nombre o email)"
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <div>
          <input
            name="monto"
            defaultValue={montoQ}
            placeholder="Monto USD"
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <div className="flex gap-2">
          <button className="bg-blue-600 text-white px-3 py-1 rounded">Filtrar</button>
          <a
            href={`/dashboard/admin/comisiones/${overview.seller.id}`}
            className="px-3 py-1 rounded border text-gray-700"
          >
            Limpiar
          </a>
        </div>
      </form>

      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold">Ultimas 20 ventas</h2>
          <span className="text-xs text-gray-500">Ordenadas por fecha</span>
        </div>
        {orders.length === 0 ? (
          <div className="text-sm text-gray-500">Sin ventas para este vendedor.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="px-2 py-1 text-left">Fecha</th>
                  <th className="px-2 py-1 text-left">Cliente</th>
                  <th className="px-2 py-1 text-left">Factura/Orden</th>
                  <th className="px-2 py-1 text-right">Total USD</th>
                  <th className="px-2 py-1 text-right">Comision %</th>
                  <th className="px-2 py-1 text-right">Comision USD</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o: any) => {
                  const invoiceLabel = o.invoiceNumber
                    ? `Factura ${String(o.invoiceNumber).padStart(10, '0')}`
                    : `Orden ${String(o.id || '').slice(-6)}`;
                  return (
                    <tr key={o.id} className="border-t">
                      <td className="px-2 py-1 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleString()}
                      </td>
                      <td className="px-2 py-1">
                        <div className="font-medium">{o.user?.name || o.user?.email}</div>
                        <div className="text-xs text-gray-500">{o.user?.email}</div>
                      </td>
                      <td className="px-2 py-1">{invoiceLabel}</td>
                      <td className="px-2 py-1 text-right">{Number(o.totalUSD).toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">
                        {o.commission ? Number(o.commission.percent).toFixed(2) : '-'}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {o.commission ? Number(o.commission.amountUSD).toFixed(2) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
