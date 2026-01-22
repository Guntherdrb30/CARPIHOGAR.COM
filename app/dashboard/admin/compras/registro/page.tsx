import { getSuppliers, getPurchases } from "@/server/actions/procurement";
import PurchaseEntryForm from "@/components/admin/purchase-entry-form";
import { getSettings } from "@/server/actions/settings";
import { getBankAccounts } from "@/server/actions/banking";

export default async function RegistroCompraPage() {
  const [suppliers, settings, bankAccounts, purchases] = await Promise.all([
    getSuppliers(),
    getSettings(),
    getBankAccounts().catch(() => []),
    getPurchases().catch(() => []),
  ]);
  const ivaPercent = Number((settings as any)?.ivaPercent || 16);
  const defaultMargins = {
    client: Number((settings as any)?.defaultMarginClientPct || 40),
    ally: Number((settings as any)?.defaultMarginAllyPct || 30),
    wholesale: Number((settings as any)?.defaultMarginWholesalePct || 20),
  };
  const purchaseRows = Array.isArray(purchases) ? purchases : [];
  const grouped = purchaseRows.reduce((groups: Record<string, { label: string; rows: any[] }>, p: any) => {
    const dateBase = p.invoiceDate ? new Date(p.invoiceDate as any) : new Date(p.createdAt as any);
    const key = isNaN(dateBase.getTime()) ? 'Sin fecha' : dateBase.toISOString().slice(0, 10);
    const label = isNaN(dateBase.getTime()) ? 'Sin fecha' : dateBase.toLocaleDateString();
    if (!groups[key]) groups[key] = { label, rows: [] };
    groups[key].rows.push(p);
    return groups;
  }, {} as Record<string, { label: string; rows: any[] }>);
  const groupedEntries = Object.entries(grouped).sort((a, b) => {
    const aDate = a[0] === 'Sin fecha' ? 0 : Date.parse(a[0]) || 0;
    const bDate = b[0] === 'Sin fecha' ? 0 : Date.parse(b[0]) || 0;
    return bDate - aDate;
  });
  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Entrada de productos</h1>
      <PurchaseEntryForm
        suppliers={suppliers}
        defaultTasa={Number((settings as any)?.tasaVES || 0)}
        defaultIvaPercent={ivaPercent}
        bankAccounts={bankAccounts as any}
        defaultMargins={defaultMargins}
      />
      <details className="bg-white p-4 rounded-lg shadow">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">
          Facturas cargadas ({purchaseRows.length})
        </summary>
        <div className="mt-3 space-y-3">
          {groupedEntries.map(([dateKey, group]) => (
            <div key={dateKey} className="border rounded">
              <div className="px-3 py-2 bg-gray-50 text-sm font-semibold">{group.label}</div>
              <div className="overflow-x-auto">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-2 text-left">Factura</th>
                      <th className="px-3 py-2">Proveedor</th>
                      <th className="px-3 py-2">Fecha factura</th>
                      <th className="px-3 py-2">Moneda</th>
                      <th className="px-3 py-2">Total USD</th>
                      <th className="px-3 py-2">Items</th>
                      <th className="px-3 py-2">Creado</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((p: any) => (
                      <tr key={p.id}>
                        <td className="border px-3 py-2">
                          <div className="font-medium">{p.invoiceNumber || 'Sin numero'}</div>
                          <div className="text-xs text-gray-500">ID {String(p.id || '').slice(-6)}</div>
                        </td>
                        <td className="border px-3 py-2">{p.supplier?.name || '-'}</td>
                        <td className="border px-3 py-2 text-center">
                          {p.invoiceDate ? new Date(p.invoiceDate as any).toLocaleDateString() : '-'}
                        </td>
                        <td className="border px-3 py-2 text-center">{String(p.currency || 'USD')}</td>
                        <td className="border px-3 py-2 text-right">
                          {Number(p.totalUSD || 0).toFixed(2)}
                        </td>
                        <td className="border px-3 py-2 text-center">{Number(p.itemsCount || (p.items || []).length || 0)}</td>
                        <td className="border px-3 py-2 text-center">
                          {p.createdAt ? new Date(p.createdAt as any).toLocaleDateString() : '-'}
                        </td>
                        <td className="border px-3 py-2 text-right">
                          <a className="text-blue-600 hover:underline" href={`/dashboard/admin/compras/ia/${p.id}`}>
                            Ver
                          </a>
                        </td>
                      </tr>
                    ))}
                    {group.rows.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 text-sm text-gray-500" colSpan={8}>
                          Sin facturas registradas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {purchaseRows.length === 0 && (
            <div className="text-sm text-gray-500">Sin facturas registradas.</div>
          )}
        </div>
      </details>
    </div>
  );
}
