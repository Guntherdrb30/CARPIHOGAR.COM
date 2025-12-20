import prisma from '@/lib/prisma';
import { getPayables, addPayablePayment } from '@/server/actions/payables';
import { getBankAccounts } from '@/server/actions/banking';
import { ensureSupplierColumns } from '@/server/actions/procurement';

export default async function CuentasPorPagarPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    proveedor?: string;
    desde?: string;
    hasta?: string;
    factura?: string;
  }>;
}) {
  const sp = (await searchParams) || ({} as any);
  const statusFilter = String(sp.status || 'TODOS').toUpperCase();
  const supplierId = String(sp.proveedor || '').trim();
  const desde = String(sp.desde || '').trim();
  const hasta = String(sp.hasta || '').trim();
  const invoiceQ = String(sp.factura || '').trim();

  await ensureSupplierColumns();
  const [payables, suppliers, banks] = await Promise.all([
    getPayables({
      status: statusFilter === 'TODOS' ? undefined : statusFilter,
      supplierId: supplierId || undefined,
      from: desde || undefined,
      to: hasta || undefined,
      invoice: invoiceQ || undefined,
    }).catch(() => [] as any[]),
    prisma.supplier.findMany({ orderBy: { name: 'asc' } }),
    getBankAccounts().catch(() => [] as any[]),
  ]);

  const statusOptions = ['TODOS', 'PENDIENTE', 'PARCIAL', 'PAGADO', 'CANCELADO'] as const;

  return (
    <div className="container mx-auto px-4 py-8 space-y-4">
      <h1 className="text-2xl font-bold mb-2">Cuentas por Pagar</h1>

      {/* Filtros */}
      <form
        method="get"
        className="bg-white border rounded p-4 mb-4 grid grid-cols-1 md:grid-cols-6 gap-3"
      >
        <div>
          <label className="text-xs text-gray-600">Factura / Compra</label>
          <input
            name="factura"
            defaultValue={invoiceQ}
            placeholder="N° factura o ID compra"
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">Proveedor</label>
          <select
            name="proveedor"
            defaultValue={supplierId}
            className="border rounded px-2 py-1 w-full bg-white"
          >
            <option value="">Todos</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600">Desde</label>
          <input
            type="date"
            name="desde"
            defaultValue={desde}
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">Hasta</label>
          <input
            type="date"
            name="hasta"
            defaultValue={hasta}
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <div>
          <label className="text-xs text-gray-600">Estado</label>
          <select
            name="status"
            defaultValue={statusFilter}
            className="border rounded px-2 py-1 w-full bg-white"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
            Aplicar
          </button>
          <a
            href="/dashboard/admin/cuentas-por-pagar"
            className="border px-3 py-1 rounded text-sm"
          >
            Limpiar
          </a>
        </div>
      </form>

      {/* Tabla principal */}
      <div className="bg-white border rounded p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Factura / Compra</th>
                <th className="px-3 py-2 text-left">Proveedor</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-right">Total USD</th>
                <th className="px-3 py-2 text-right">Saldo USD</th>
                <th className="px-3 py-2 text-left">Vence</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Pago rápido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payables.map((p: any) => {
                const totalUSD = Number(p.totalUSD || 0);
                const balanceUSD = Number(p.balanceUSD || 0);
                const vence = p.dueDate ? new Date(p.dueDate as any) : null;
                const createdAt = p.createdAt ? new Date(p.createdAt as any) : null;
                return (
                  <tr key={p.id} className="align-top hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">
                        {p.purchase?.invoiceNumber || 'Sin número'}
                      </div>
                      <div className="text-xs text-gray-500">
                        Compra {String(p.purchaseId || '').slice(-6)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {p.supplier?.name || '—'}
                      </div>
                      {p.supplier?.taxId && (
                        <div className="text-xs text-gray-500">
                          RIF: {p.supplier.taxId}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' +
                          (p.status === 'PAGADO'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : p.status === 'PARCIAL'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : p.status === 'CANCELADO'
                            ? 'bg-gray-100 text-gray-600 border border-gray-200'
                            : 'bg-red-50 text-red-700 border border-red-200')
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      ${totalUSD.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      ${balanceUSD.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      {vence ? vence.toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      {createdAt ? createdAt.toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {balanceUSD <= 0.01 ? (
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="text-gray-400">Sin saldo</span>
                          <a
                            className="px-2 py-0.5 border rounded text-center"
                            href={`/dashboard/admin/cuentas-por-pagar/${p.id}`}
                          >
                            Ver cuenta por pagar
                          </a>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 text-xs">
                          <form
                            action={addPayablePayment}
                            className="grid grid-cols-1 gap-1"
                          >
                            <input
                              type="hidden"
                              name="payableId"
                              value={p.id}
                            />
                            <div className="flex gap-2">
                              <input
                                name="amount"
                                type="number"
                                min={0}
                                step={0.01}
                                defaultValue={balanceUSD.toFixed(2)}
                                className="border rounded px-1 py-0.5 w-24"
                              />
                              <select
                                name="currency"
                                defaultValue="USD"
                                className="border rounded px-1 py-0.5 w-20 bg-white"
                              >
                                <option value="USD">USD</option>
                                <option value="VES">Bs</option>
                                <option value="USDT">USDT</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <select
                                name="bankAccountId"
                                defaultValue=""
                                className="border rounded px-1 py-0.5 flex-1 bg-white"
                              >
                                <option value="">Sin banco</option>
                                {banks.map((b: any) => (
                                  <option key={b.id} value={b.id}>
                                    {b.name} ({b.currency})
                                  </option>
                                ))}
                              </select>
                              <input
                                name="reference"
                                placeholder="Ref."
                                className="border rounded px-1 py-0.5 w-24"
                              />
                            </div>
                            <button className="mt-1 bg-brand text-white px-2 py-0.5 rounded">
                              Abonar
                            </button>
                          </form>
                          <a
                            className="px-2 py-0.5 border rounded text-center"
                            href={`/dashboard/admin/cuentas-por-pagar/${p.id}`}
                          >
                            Ver cuenta por pagar
                          </a>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {payables.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-3 text-sm text-gray-500"
                    colSpan={8}
                  >
                    No hay cuentas por pagar registradas con los filtros
                    actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
