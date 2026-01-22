import Link from 'next/link';
import CommissionPaymentForm from '@/components/admin/commission-payment-form';
import {
  getCommissionPayments,
  getSellerCommissionSummary,
  updateSellerCommissionByForm,
} from '@/server/actions/commissions';

export default async function AdminCommissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    message?: string;
    error?: string;
    seller?: string;
    ref?: string;
    amount?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = (await searchParams) || {};
  const message = String(sp.message || '');
  const error = String(sp.error || '');
  const sellerFilter = String(sp.seller || '').trim();
  const refFilter = String(sp.ref || '').trim();
  const amountFilter = String(sp.amount || '').trim();
  const fromFilter = String(sp.from || '').trim();
  const toFilter = String(sp.to || '').trim();

  const { sellers, defaultCommissionPercent } = await getSellerCommissionSummary();
  const payments = await getCommissionPayments({
    sellerId: sellerFilter || undefined,
    reference: refFilter || undefined,
    amount: amountFilter || undefined,
    from: fromFilter || undefined,
    to: toFilter || undefined,
    take: 50,
  });

  const totals = sellers.reduce(
    (acc, s) => {
      acc.sales += s.totalSalesUSD;
      acc.commissions += s.totalCommissionUSD;
      acc.count += s.salesCount;
      return acc;
    },
    { sales: 0, commissions: 0, count: 0 }
  );

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Comisiones</h1>
        <a href="/dashboard/admin/ventas" className="px-3 py-1 rounded border">
          Ver ventas
        </a>
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

      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
          <div>Total ventas: ${totals.sales.toFixed(2)}</div>
          <div>Total comisiones: ${totals.commissions.toFixed(2)}</div>
          <div>Ventas registradas: {totals.count}</div>
          <div>Comision default: {defaultCommissionPercent.toFixed(2)}%</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Vendedores</h2>
        {sellers.length === 0 ? (
          <div className="text-sm text-gray-500">No hay vendedores registrados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="px-2 py-1 text-left">Vendedor</th>
                  <th className="px-2 py-1 text-right">Ventas USD</th>
                  <th className="px-2 py-1 text-right">Comisiones USD</th>
                  <th className="px-2 py-1 text-right"># Ventas</th>
                  <th className="px-2 py-1 text-left w-56">Comision %</th>
                  <th className="px-2 py-1 text-left w-28">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-2 py-1">
                      <div className="font-medium">{s.name || s.email}</div>
                      <div className="text-xs text-gray-500">{s.email}</div>
                    </td>
                    <td className="px-2 py-1 text-right">{s.totalSalesUSD.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{s.totalCommissionUSD.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{s.salesCount}</td>
                    <td className="px-2 py-1">
                      <form action={updateSellerCommissionByForm} className="flex items-center gap-2">
                        <input type="hidden" name="sellerId" value={s.id} />
                        <input type="hidden" name="backTo" value="/dashboard/admin/comisiones" />
                        <input
                          name="commissionPercent"
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          defaultValue={s.commissionPercent ?? ''}
                          placeholder={defaultCommissionPercent.toFixed(2)}
                          className="border rounded px-2 py-1 w-24"
                        />
                        <button className="px-2 py-1 rounded border text-gray-700">Guardar</button>
                      </form>
                      <div className="text-xs text-gray-500 mt-1">
                        Deja vacio para usar default.
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <Link
                        href={`/dashboard/admin/comisiones/${s.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        Ver ventas
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold">Pagos de comisiones</h2>
            <div className="text-xs text-gray-500">
              Registra pagos y revisa el historial por vendedor.
            </div>
          </div>
          <div className="text-xs text-gray-500">Ultimos {payments.length} pagos</div>
        </div>

        <div className="border rounded p-3 bg-gray-50">
          <CommissionPaymentForm sellers={sellers} defaultSellerId={sellerFilter} />
        </div>

        <form
          method="get"
          className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        >
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-600 mb-1">Vendedor</label>
            <select
              name="seller"
              defaultValue={sellerFilter}
              className="border rounded px-2 py-1 w-full"
            >
              <option value="">Todos</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Referencia</label>
            <input
              name="ref"
              defaultValue={refFilter}
              className="border rounded px-2 py-1 w-full"
              placeholder="Ref"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Monto</label>
            <input
              name="amount"
              defaultValue={amountFilter}
              className="border rounded px-2 py-1 w-full"
              placeholder="Monto"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Desde</label>
            <input
              type="date"
              name="from"
              defaultValue={fromFilter}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Hasta</label>
            <input
              type="date"
              name="to"
              defaultValue={toFilter}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div className="flex gap-2 md:col-span-6">
            <button className="bg-blue-600 text-white px-3 py-1 rounded">
              Filtrar
            </button>
            <a href="/dashboard/admin/comisiones" className="px-3 py-1 rounded border text-gray-700">
              Limpiar
            </a>
          </div>
        </form>

        {payments.length === 0 ? (
          <div className="text-sm text-gray-500">No hay pagos registrados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="px-2 py-1 text-left">Fecha</th>
                  <th className="px-2 py-1 text-left">Vendedor</th>
                  <th className="px-2 py-1 text-right">Monto</th>
                  <th className="px-2 py-1 text-left">Metodo</th>
                  <th className="px-2 py-1 text-left">Banco</th>
                  <th className="px-2 py-1 text-left">Referencia</th>
                  <th className="px-2 py-1 text-left">Responsable</th>
                  <th className="px-2 py-1 text-left">Soporte</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-2 py-1 whitespace-nowrap">
                      {new Date(p.paidAt).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-1">
                      <div className="font-medium">{p.seller?.name || p.seller?.email}</div>
                      <div className="text-xs text-gray-500">{p.seller?.email}</div>
                    </td>
                    <td className="px-2 py-1 text-right">
                      {Number(p.amount).toFixed(2)} {p.currency}
                    </td>
                    <td className="px-2 py-1">{p.method}</td>
                    <td className="px-2 py-1">{p.bankName || '-'}</td>
                    <td className="px-2 py-1">{p.reference || '-'}</td>
                    <td className="px-2 py-1">{p.paidByName || '-'}</td>
                    <td className="px-2 py-1">
                      {p.proofUrl ? (
                        <a className="text-blue-600 hover:underline" href={p.proofUrl} target="_blank">
                          Ver
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
