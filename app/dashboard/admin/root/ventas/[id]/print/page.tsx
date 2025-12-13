import { getRootSecretSaleById } from '@/server/actions/root-sales';
import { getSettings } from '@/server/actions/settings';
import PrintButton from '@/components/print-button';

export default async function RootSalePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sale, settings] = await Promise.all([getRootSecretSaleById(id), getSettings()]);

  if (!sale) {
    return <div className="p-4">Nota no encontrada</div>;
  }

  const noteCode = `ROOT-${String(sale.noteNumber).padStart(6, '0')}`;
  const totalUSD = Number(sale.totalUSD || 0);
  const tasa = Number((settings as any)?.tasaVES || 40);
  const totalVES = totalUSD * tasa;
  const brand = (settings as any)?.brandName || 'Carpihogar.ai';
  const contact = (settings as any)?.contactEmail || 'root@carpihogar.com';

  return (
    <div className="p-6 text-sm space-y-4">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Nota interna Root</h1>
          <p className="text-gray-500">Solo para control interno</p>
        </div>
        <PrintButton />
      </div>
      <div className="max-w-3xl mx-auto bg-white border rounded p-6 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xl font-semibold">{brand}</div>
            <div className="text-gray-600">{contact}</div>
          </div>
          <div className="text-right">
            <div className="text-sm uppercase text-gray-500">Nota #</div>
            <div className="text-2xl font-bold">{noteCode}</div>
            <div className="text-xs text-gray-500">
              Generada: {new Date(sale.createdAt as any).toLocaleString('es-VE')}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded p-3 bg-gray-50">
          <div>
            <div className="text-xs uppercase text-gray-500">Cliente</div>
            <div className="text-base font-medium text-gray-900">
              {sale.customerName || 'Sin nombre registrado'}
            </div>
            {sale.customerPhone && (
              <div className="text-sm text-gray-600">Tel: {sale.customerPhone}</div>
            )}
            {sale.customerTaxId && (
              <div className="text-sm text-gray-600">RIF/Cédula: {sale.customerTaxId}</div>
            )}
            {sale.customerFiscalAddress && (
              <div className="text-xs text-gray-500 mt-1">{sale.customerFiscalAddress}</div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase text-gray-500">Condiciones</div>
            <div className="text-sm text-gray-700">Operación interna sin IVA.</div>
            <div className="text-sm text-gray-700">
              Tasa referencia: <strong>{tasa.toFixed(2)} Bs/USD</strong>
            </div>
            {sale.observations && (
              <div className="text-xs text-gray-500 mt-1">Obs: {sale.observations}</div>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-600">
              <th className="text-left px-2 py-1">Producto</th>
              <th className="text-right px-2 py-1">Precio USD</th>
              <th className="text-right px-2 py-1">Cantidad</th>
              <th className="text-right px-2 py-1">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item: any) => (
              <tr key={item.id} className="border-b last:border-b-0">
                <td className="px-2 py-1">
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-500">
                    {item.product?.sku || item.productId || 'sin sku'}
                  </div>
                </td>
                <td className="px-2 py-1 text-right">${Number(item.priceUSD || 0).toFixed(2)}</td>
                <td className="px-2 py-1 text-right">{item.quantity}</td>
                <td className="px-2 py-1 text-right">
                  ${(Number(item.priceUSD || 0) * Number(item.quantity || 0)).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-64 border rounded p-3 bg-gray-50 space-y-1">
            <div className="flex justify-between text-sm">
              <span>Subtotal:</span>
              <span>${totalUSD.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Total aprox Bs:</span>
              <span>Bs {totalVES.toFixed(2)}</span>
            </div>
            <div className="text-xs text-gray-500 text-right">
              Operación exenta de IVA bajo control del root.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
