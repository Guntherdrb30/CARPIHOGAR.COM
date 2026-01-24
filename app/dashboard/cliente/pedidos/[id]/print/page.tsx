import { getMyOrderById } from "@/server/actions/orders";
import { getSettings } from "@/server/actions/settings";
import PrintButton from "@/components/print-button";

const formatDateDMY = (date: Date) => {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
};

const paymentMethodLabel = (method?: string | null) => {
  const raw = String(method || "").toUpperCase();
  if (raw === "EFECTIVO") return "Efectivo";
  if (raw === "ZELLE") return "Zelle";
  if (raw === "PAGO_MOVIL") return "Pago Movil";
  if (raw === "TRANSFERENCIA") return "Transferencia";
  return raw || "-";
};

const padLeft = (num: number, width: number) => {
  const s = String(num);
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
};

export default async function PrintMyOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tipo?: string; moneda?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  const tipoRaw = String(sp.tipo || "recibo").toLowerCase();
  const allowedDocs = ["recibo", "factura", "nota"];
  const tipo = allowedDocs.includes(tipoRaw) ? tipoRaw : "recibo";

  const [order, settings] = await Promise.all([
    getMyOrderById(id),
    getSettings(),
  ]);

  const statusUp = String(order.status || "").toUpperCase();
  const docsAvailable =
    (statusUp === "PAGADO" || statusUp === "COMPLETADO") &&
    !!order.reviewedAt;
  if (!docsAvailable) {
    return (
      <div className="p-6 text-sm">
        <div className="max-w-xl mx-auto bg-white rounded border shadow p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold text-gray-800">
            Documento no disponible
          </h1>
          <p className="text-gray-600">
            Tu pago esta en revision. Cuando el equipo confirme la operacion,
            podras descargar tu recibo y factura desde esta pagina.
          </p>
          <a
            href="/dashboard/cliente/pedidos"
            className="inline-flex items-center justify-center rounded border px-4 py-2 text-sm text-blue-700"
          >
            Volver a mis pedidos
          </a>
        </div>
      </div>
    );
  }

  const storedDocType = String((order as any).documentType || "").toUpperCase();
  const effectiveTipo =
    storedDocType === "RECIBO"
      ? "recibo"
      : storedDocType === "FACTURA"
      ? "factura"
      : tipo;
  const hasFixedDocType =
    storedDocType === "RECIBO" || storedDocType === "FACTURA";

  // Las facturas/recibos del cliente se generan solo en Bs (VES)
  const moneda = "VES";
  const ivaPercent = Number(order.ivaPercent || (settings as any).ivaPercent || 16);
  const tasaVES = Number(order.tasaVES || (settings as any).tasaVES || 40);

  const subtotalUSD = Number(order.subtotalUSD);
  const effectiveIvaPercent = effectiveTipo === "factura" ? ivaPercent : 0;
  const ivaUSD = Number((subtotalUSD * effectiveIvaPercent) / 100);
  const totalUSD =
    effectiveTipo === "factura"
      ? Number(subtotalUSD + ivaUSD)
      : Number(order.totalUSD || subtotalUSD);

  const toMoney = (v: number) => v * tasaVES;
  const fmt = (v: number) => `Bs ${v.toFixed(2)}`;

  const invoiceNumber = (order as any).invoiceNumber as
    | number
    | null
    | undefined;
  const receiptNumber = (order as any).receiptNumber as
    | number
    | null
    | undefined;
  const code =
    effectiveTipo === "factura"
      ? invoiceNumber
        ? padLeft(invoiceNumber, 10)
        : String(order.id || "").slice(-6)
      : receiptNumber
      ? padLeft(receiptNumber, 10)
      : String(order.id || "").slice(-6);

  const titleMap: Record<string, string> = {
    recibo: "Recibo",
    factura: "Factura",
    nota: "Nota de entrega",
  };
  const title = titleMap[effectiveTipo] || "Comprobante";

  return (
    <div className="p-6 text-sm">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="space-x-2">
          {!hasFixedDocType && effectiveTipo !== "factura" && (
            <a className="px-3 py-1 border rounded" href={`?tipo=recibo`}>
              Recibo
            </a>
          )}
          {!hasFixedDocType && effectiveTipo !== "recibo" && (
            <a className="px-3 py-1 border rounded" href={`?tipo=factura`}>
              Factura
            </a>
          )}
        </div>
        <PrintButton />
      </div>

      <div className="max-w-3xl mx-auto bg-white p-6 border rounded print:border-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xl font-bold">
              {(settings as any).brandName || "Carpihogar.ai"}
            </div>
            <div className="text-gray-600">
              {(settings as any).contactEmail} -{" "}
              {String((settings as any).contactPhone)}
            </div>
          </div>
          {(settings as any).logoUrl && (
            <img src={(settings as any).logoUrl} alt="logo" className="h-10" />
          )}
        </div>

        <div className="flex justify-between mb-4">
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-gray-600">Nro: {code}</div>
            <div className="text-gray-600">
              Fecha: {formatDateDMY(new Date(order.createdAt as any))}
            </div>
            <div className="text-gray-600">
              Metodo: {paymentMethodLabel(order.payment?.method)}
            </div>
            <div className="text-gray-600">Moneda: {moneda}</div>
            {effectiveTipo === "factura" && (
              <div className="text-gray-600">IVA: {ivaPercent}%</div>
            )}
            {moneda === "VES" && (
              <div className="text-gray-600">Tasa: {tasaVES}</div>
            )}
          </div>
          <div>
            <div className="font-semibold">Cliente</div>
            <div>{order.user?.name || order.user?.email}</div>
            {effectiveTipo === "factura" && (
              <div className="text-gray-600 mt-1">
                {order.customerTaxId && (
                  <div>Cedula/RIF: {order.customerTaxId}</div>
                )}
                {order.customerFiscalAddress && (
                  <div>Direccion fiscal: {order.customerFiscalAddress}</div>
                )}
              </div>
            )}
            {effectiveTipo !== "factura" && order.payment && (
              <div className="text-gray-600 mt-1">
                Pago: {order.payment.method} - {order.payment.currency}
                {order.payment.reference
                  ? ` - Ref: ${order.payment.reference}`
                  : ""}
              </div>
            )}
            {effectiveTipo !== "factura" &&
              order.payment?.method === "PAGO_MOVIL" && (
                <div className="text-gray-600 mt-1">
                  {order.payment.payerName && (
                    <div>Titular: {order.payment.payerName}</div>
                  )}
                  {order.payment.payerPhone && (
                    <div>Telefono: {order.payment.payerPhone}</div>
                  )}
                  {order.payment.payerBank && (
                    <div>Banco: {order.payment.payerBank}</div>
                  )}
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
            {order.items.map((it: any) => {
              const priceUSD = Number(it.priceUSD);
              const subUSD = priceUSD * Number(it.quantity);
              return (
                <tr key={it.id}>
                  <td className="border px-2 py-1">{it.name}</td>
                  <td className="border px-2 py-1 text-right">
                    {fmt(toMoney(priceUSD))}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {it.quantity}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {fmt(toMoney(subUSD))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{fmt(toMoney(subtotalUSD))}</span>
            </div>
            {effectiveTipo === "factura" && (
              <div className="flex justify-between">
                <span>IVA ({ivaPercent}%)</span>
                <span>{fmt(toMoney(ivaUSD))}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t mt-1 pt-1">
              <span>Total</span>
              <span>{fmt(toMoney(totalUSD))}</span>
            </div>
          </div>
        </div>

        <div className="text-gray-500 text-xs mt-6">
          Este documento es generado por el sistema.{" "}
          {effectiveTipo === "factura" ? "" : "No constituye factura fiscal."}
        </div>
      </div>
    </div>
  );
}
