import { getInventoryStockReport } from '@/server/actions/inventory';
import { getSettings } from '@/server/actions/settings';
import PrintButton from '@/components/print-button';

export default async function PrintInventoryStockReport({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const sp = (await searchParams) || ({} as any);
  const from = String(sp.from || '').trim();
  const to = String(sp.to || '').trim();

  const [data, settings] = await Promise.all([
    getInventoryStockReport({ from: from || undefined, to: to || undefined }),
    getSettings(),
  ]);

  const rangeLabel = from || to ? `Rango: ${from || '...'} a ${to || '...'}` : 'Inventario actual';

  return (
    <div className="p-6 text-sm">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="text-sm text-gray-600">{rangeLabel}</div>
        <PrintButton />
      </div>

      <div className="max-w-6xl mx-auto bg-white p-6 border rounded print:border-0">
        {(settings as any).logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="flex justify-end mb-2">
            <img src={(settings as any).logoUrl} alt="logo" className="h-10" />
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xl font-bold">Reporte de Inventario</div>
            <div className="text-gray-600">{rangeLabel}</div>
          </div>
          <div className="text-sm text-gray-600">
            Total: ${data.totalValueUSD.toFixed(2)}
          </div>
        </div>

        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left px-2 py-1">Codigo</th>
              <th className="text-left px-2 py-1">Producto</th>
              <th className="text-left px-2 py-1">Descripcion</th>
              <th className="text-left px-2 py-1">Proveedor</th>
              <th className="text-right px-2 py-1">Cantidad</th>
              <th className="text-right px-2 py-1">Precio USD</th>
              <th className="text-right px-2 py-1">Total USD</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r: any) => (
              <tr key={r.id}>
                <td className="border px-2 py-1">{r.code || '—'}</td>
                <td className="border px-2 py-1">{r.name}</td>
                <td className="border px-2 py-1">{r.description || '—'}</td>
                <td className="border px-2 py-1">{r.supplier || '—'}</td>
                <td className="border px-2 py-1 text-right">{r.stock}</td>
                <td className="border px-2 py-1 text-right">{r.priceUSD.toFixed(2)}</td>
                <td className="border px-2 py-1 text-right">{r.totalUSD.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
