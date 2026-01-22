import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrderById } from "@/server/actions/sales";
import { getSettings } from "@/server/actions/settings";
import PrintButton from "@/components/print-button";


const formatDateDMY = (date: Date) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
};

const paymentMethodLabel = (method?: string | null) => {
  const raw = String(method || '').toUpperCase();
  if (raw === 'EFECTIVO') return 'Efectivo';
  if (raw === 'ZELLE') return 'Zelle';
  if (raw === 'PAGO_MOVIL') return 'Pago Movil';
  if (raw === 'TRANSFERENCIA') return 'Transferencia';
  return raw || '-';
};


export default async function PrintAllySalePage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ tipo?: string; moneda?: string }> }) {
  const { id } = await params;
  const sp = (await searchParams) || {} as any;
  const tipo = (sp.tipo || 'recibo').toLowerCase();

  const session = await getServerSession(authOptions);
  const me = session?.user as any;
  if (!me?.id || me?.role !== 'ALIADO') return <div className="p-4">No autorizado.</div>;

  const [order, settings] = await Promise.all([
    getOrderById(id),
    getSettings(),
  ]);
  if (!order) return <div className="p-4">Venta no encontrada</div>;
  if (String((order as any).sellerId || '') !== String(me.id)) return <div className="p-4">No autorizado.</div>;

  const storedDocType = String((order as any).documentType || '').toUpperCase();
  const effectiveTipo = storedDocType === 'RECIBO' ? 'recibo' : storedDocType === 'FACTURA' ? 'factura' : tipo;
  const hasFixedDocType = storedDocType === 'RECIBO' || storedDocType === 'FACTURA';

  // Impresiones legales del aliado: solo en Bs (VES) usando tasaBCV
  const moneda: 'VES' = 'VES';
  const ivaPercent = Number((order as any).ivaPercent || (settings as any).ivaPercent || 16);
  const tasaVES = Number((order as any).tasaVES || (settings as any).tasaVES || 40);
  const subtotalUSD = Number((order as any).subtotalUSD);
  const effectiveIvaPercent = effectiveTipo === 'factura' ? ivaPercent : 0;
  const ivaUSD = Number((subtotalUSD * effectiveIvaPercent) / 100);
  const totalUSD = effectiveTipo === 'factura' ? Number(subtotalUSD + ivaUSD) : Number((order as any).totalUSD || subtotalUSD);

  const toMoney = (v: number) => v * tasaVES;
  const fmt = (v: number) => `Bs ${v.toFixed(2)}`;
  const titleMap: any = { recibo: 'Recibo', factura: 'Factura' };
  const title = titleMap[effectiveTipo] || 'Comprobante';
  const invoiceNumber = (order as any).invoiceNumber as number | null | undefined;
  const receiptNumber = (order as any).receiptNumber as number | null | undefined;
  const code =
    effectiveTipo === 'factura'
      ? invoiceNumber
        ? String(invoiceNumber).padStart(6, '0')
        : String((order as any).id || '').slice(-6)
      : receiptNumber
      ? String(receiptNumber).padStart(8, '0')
      : String((order as any).id || '').slice(-6);

  return (
    <div className="p-6 text-sm">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="space-x-2">
          {!hasFixedDocType && effectiveTipo !== 'factura' && (
            <a className="px-3 py-1 border rounded" href={`?tipo=recibo`}>Recibo</a>
          )}
          {!hasFixedDocType && effectiveTipo !== 'recibo' && (
            <a className="px-3 py-1 border rounded" href={`?tipo=factura`}>Factura</a>
          )}
        </div>
        <PrintButton />
      </div>

      <div className="max-w-3xl mx-auto bg-white p-6 border rounded print:border-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xl font-bold">{(settings as any).brandName || 'Carpihogar.ai'}</div>
            <div className="text-gray-600">{(settings as any).contactEmail} - {String((settings as any).contactPhone)}</div>
          </div>
          {(settings as any).logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={(settings as any).logoUrl} alt="logo" className="h-10" />
          )}
        </div>

        <div className="flex justify-between mb-4">
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-gray-600">No.: {code}</div>
            <div className="text-gray-600">Fecha: {formatDateDMY(new Date((order as any).createdAt as any))}</div>
            <div className="text-gray-600">Metodo: {paymentMethodLabel((order as any).payment?.method)}</div>
            <div className="text-gray-600">Moneda: {moneda}</div>
            {effectiveTipo === 'factura' && (<div className="text-gray-600">IVA: {ivaPercent}%</div>)}
            {moneda === 'VES' && <div className="text-gray-600">Tasa: {tasaVES}</div>}
          </div>
          <div>
            <div className="font-semibold">Cliente</div>
            <div>{(order as any).user?.name || (order as any).user?.email}</div>
            {effectiveTipo === 'factura' && (
              <div className="text-gray-600 mt-1">
                {(order as any).customerTaxId && (<div>Cedula/RIF: {(order as any).customerTaxId}</div>)}
                {(order as any).customerFiscalAddress && (<div>Direccion fiscal: {(order as any).customerFiscalAddress}</div>)}
              </div>
            )}
            {effectiveTipo !== 'factura' && (order as any).payment && (
              <div className="text-gray-600 mt-1">
                Pago: {(order as any).payment.method} - {(order as any).payment.currency}
                {(order as any).payment.reference ? ` - Ref: ${(order as any).payment.reference}` : ''}
              </div>
            )}
            {effectiveTipo !== 'factura' && (order as any).payment?.method === 'PAGO_MOVIL' && (
              <div className="text-gray-600 mt-1">
                {(order as any).payment.payerName && (<div>Titular: {(order as any).payment.payerName}</div>)}
                {(order as any).payment.payerPhone && (<div>Telefono: {(order as any).payment.payerPhone}</div>)}
                {(order as any).payment.payerBank && (<div>Banco: {(order as any).payment.payerBank}</div>)}
              </div>
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
            {(order as any).items.map((it: any) => {
              const priceUSD = Number(it.priceUSD);
              const subUSD = priceUSD * Number(it.quantity);
              return (
                <tr key={it.id}>
                  <td className="border px-2 py-1">{it.name || it.product?.name}</td>
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
            {effectiveTipo === 'factura' && (
              <div className="flex justify-between"><span>IVA ({ivaPercent}%)</span><span>{fmt(toMoney(ivaUSD))}</span></div>
            )}
            <div className="flex justify-between font-semibold border-t mt-1 pt-1"><span>Total</span><span>{fmt(toMoney(totalUSD))}</span></div>
          </div>
        </div>

        <div className="text-gray-500 text-xs mt-6">
          Este documento es generado por el sistema. {effectiveTipo === 'factura' ? '' : 'No constituye factura fiscal.'}
        </div>
      </div>
    </div>
  );
}
