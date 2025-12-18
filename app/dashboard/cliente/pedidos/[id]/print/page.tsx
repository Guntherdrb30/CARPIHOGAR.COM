import { getMyOrderById } from "@/server/actions/orders";
import { getSettings } from "@/server/actions/settings";
import PrintButton from "@/components/print-button";

export default async function PrintMyOrderPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ tipo?: string; moneda?: string }> }) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  const tipo = (sp.tipo || 'recibo').toLowerCase();

  const [order, settings] = await Promise.all([
    getMyOrderById(id),
    getSettings(),
  ]);

  const statusUp = String(order.status || '').toUpperCase();
  const docsAvailable = (statusUp === 'PAGADO' || statusUp === 'COMPLETADO') && !!order.reviewedAt;
  if (!docsAvailable) {
    return (
      <div className="p-6 text-sm">
        <div className="max-w-xl mx-auto bg-white rounded border shadow p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold text-gray-800">Documento no disponible</h1>
          <p className="text-gray-600">
            Tu pago esta en revision. Cuando el equipo confirme la operacion, podras descargar tu recibo y factura desde esta pagina.
          </p>
          <a href="/dashboard/cliente/pedidos" className="inline-flex items-center justify-center rounded border px-4 py-2 text-sm text-blue-700">
            Volver a mis pedidos
          </a>
        </div>
      </div>
    );
  }

  // Las facturas/recibos legales para el cliente se generan solo en Bs (VES)
  const moneda = 'VES';
  const ivaPercent = Number(order.ivaPercent || (settings as any).ivaPercent || 16);
  const tasaVES = Number(order.tasaVES || (settings as any).tasaVES || 40);

  const subtotalUSD = Number(order.subtotalUSD);
  const ivaUSD = Number((subtotalUSD * ivaPercent) / 100);
  const totalUSD = Number(subtotalUSD + ivaUSD);

  const toMoney = (v: number) => v * tasaVES;
  const fmt = (v: number) => `Bs ${v.toFixed(2)}`;

  const titleMap: any = { recibo: 'Recibo', factura: 'Factura' };
  const title = titleMap[tipo] || 'Comprobante';

  return (
    <div className="p-6 text-sm">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="space-x-2">
          <a className="px-3 py-1 border rounded" href={`?tipo=recibo`}>Recibo</a>
          <a className="px-3 py-1 border rounded" href={`?tipo=factura`}>Factura</a>
        </div>
        <PrintButton />
      </div>

      <div className="max-w-3xl mx-auto bg-white p-6 border rounded print:border-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xl font-bold">{(settings as any).brandName || 'Carpihogar.ai'}</div>
            <div className="text-gray-600">{(settings as any).contactEmail} · {String((settings as any).contactPhone)}</div>
          </div>
          { (settings as any).logoUrl && (
            <img src={(settings as any).logoUrl} alt="logo" className="h-10" />
          )}
        </div>

        <div className="flex justify-between mb-4">
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-gray-600">Nº: {order.id}</div>
            <div className="text-gray-600">Fecha: {new Date(order.createdAt as any).toLocaleString()}</div>
            <div className="text-gray-600">Moneda: {moneda}</div>
            <div className="text-gray-600">IVA: {ivaPercent}%</div>
            <div className="text-gray-600">Tasa: {tasaVES}</div>
          </div>
          <div>
            <div className="font-semibold">Cliente</div>
            <div>{order.user?.name || order.user?.email}</div>
            {order.payment && (
              <div className="text-gray-600 mt-1">Pago: {order.payment.method} · {order.payment.currency}{order.payment.reference ? ` · Ref: ${order.payment.reference}` : ''}</div>
            )}
          </div>
        </div>

        <table className="w-full table-auto text-sm mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left px-2 py-1">Producto</th>
              <th className="text-right px-2 py-1">Precio</th>
              <th className="text-right px-2 py-1">Cant.</th>
              <th className="text-right px-2 py-1">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it: any) => {
              const priceUSD = Number(it.priceUSD);
              const subUSD = priceUSD * Number(it.quantity);
              return (
                <tr key={it.id}>
                  <td className="border px-2 py-1">{it.name}</td>
                  <td className="border px-2 py-1 text-right">{fmt(toMoney(priceUSD))}</td>
                  <td className="border px-2 py-1 text-right">{it.quantity}</td>
                  <td className="border px-2 py-1 text-right">{fmt(toMoney(subUSD))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between"><span>Subtotal</span><span>{fmt(toMoney(subtotalUSD))}</span></div>
            <div className="flex justify-between"><span>IVA ({ivaPercent}%)</span><span>{fmt(toMoney(ivaUSD))}</span></div>
            <div className="flex justify-between font-semibold border-t mt-1 pt-1"><span>Total</span><span>{fmt(toMoney(totalUSD))}</span></div>
          </div>
        </div>

        <div className="text-gray-500 text-xs mt-6">Este documento es generado por el sistema. {tipo === 'nota' ? 'No constituye factura.' : ''}</div>
      </div>
    </div>
  );
}
