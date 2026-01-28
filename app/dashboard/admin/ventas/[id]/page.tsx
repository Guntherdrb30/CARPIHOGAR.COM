import Link from "next/link";
import { getOrderById } from "@/server/actions/sales";
import { getSettings } from "@/server/actions/settings";
import PrintButton from "@/components/print-button";

const formatDate = (date?: string | Date) => {
  const d = date ? new Date(date) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};

const paymentMethodLabel = (method?: string | null) => {
  const raw = String(method || "").toUpperCase();
  if (raw === "EFECTIVO") return "Efectivo";
  if (raw === "ZELLE") return "Zelle";
  if (raw === "PAGO_MOVIL") return "Pago móvil";
  if (raw === "TRANSFERENCIA") return "Transferencia";
  return raw || "—";
};

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ message?: string; docType?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  const message = sp.message ? decodeURIComponent(String(sp.message)) : "";
  const docTypeParam = String(sp.docType || "").toLowerCase();

  const [order, settings] = await Promise.all([
    getOrderById(id),
    getSettings(),
  ]);

  if (!order) {
    return <div className="p-4">Venta no encontrada.</div>;
  }

  const ivaPercent = Number(order.ivaPercent || (settings as any).ivaPercent || 16);
  const tasaVES = Number(order.tasaVES || (settings as any).tasaVES || 40);
  const totalUSD = Number(order.totalUSD || 0);
  const subtotalUSD = Number(order.subtotalUSD || totalUSD);
  const docTypeStored = String((order as any).documentType || "").toLowerCase();
  const effectiveDocType =
    docTypeStored === "factura" || docTypeParam === "factura"
      ? "factura"
      : docTypeStored === "recibo" || docTypeParam === "recibo"
      ? "recibo"
      : "";
  const docLabel =
    effectiveDocType === "factura"
      ? `${
          (order as any).invoiceNumber
            ? `Factura: ${String((order as any).invoiceNumber).padStart(10, "0")}`
            : "Factura"
        }`
      : effectiveDocType === "recibo"
      ? `${
          (order as any).receiptNumber
            ? `Recibo: ${String((order as any).receiptNumber).padStart(10, "0")}`
            : "Recibo"
        }`
      : `Orden: ${String(order.id || "").slice(-6)}`;

  const canPrint =
    order.status === "PAGADO" || order.status === "COMPLETADO" || order.status === "CANCELADO";
  const printTipo = effectiveDocType || "recibo";

  const toMoneyVes = (value: number) =>
    `Bs ${(Number(value || 0) * tasaVES).toFixed(2)}`;
  const fmtUSD = (value: number) => `$${Number(value || 0).toFixed(2)}`;

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-gray-500">Venta</div>
          <h1 className="text-2xl font-bold">
            {docLabel} · {order.user?.name || order.user?.email || "Cliente sin datos"}
          </h1>
          <div className="text-xs text-gray-500">
            Registrada el {formatDate(order.createdAt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/admin/ventas"
            className="px-3 py-1 rounded border text-sm text-gray-700"
          >
            Volver a ventas
          </Link>
          {canPrint && (
            <a
              target="_blank"
              rel="noreferrer"
              href={`/dashboard/admin/ventas/${order.id}/print?tipo=${printTipo}`}
              className="px-3 py-1 rounded border text-sm text-gray-700"
            >
              Abrir comprobante
            </a>
          )}
          <PrintButton />
        </div>
      </div>

      {message && (
        <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">
          {message}
        </div>
      )}

      <div className="bg-white p-4 rounded-lg shadow grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-gray-500">Cliente</div>
          <div className="font-semibold">{order.user?.name || "Sin nombre"}</div>
          <div className="text-xs text-gray-500">{order.user?.email || "Sin email"}</div>
          {order.customerTaxId && (
            <div className="text-xs text-gray-600 mt-1">Cédula/RIF: {order.customerTaxId}</div>
          )}
        </div>
        <div>
          <div className="text-xs text-gray-500">Estado</div>
          <div
            className={`inline-flex items-center px-3 py-1 rounded text-xs font-semibold ${
              order.status === "PAGADO" || order.status === "COMPLETADO"
                ? "bg-emerald-100 text-emerald-700"
                : order.status === "CANCELADO" || order.status === "RECHAZADO"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {order.status || "—"}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Revisión: {order.reviewedAt ? "Revisada" : "Pendiente"}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Totales</div>
          <div className="font-semibold">{fmtUSD(totalUSD)}</div>
          <div className="text-xs text-gray-500">
            Equiv. {toMoneyVes(totalUSD)} (utiliza tasa {tasaVES})
          </div>
          <div className="text-xs text-gray-500 mt-1">
            IVA aplicado: {ivaPercent}% ({effectiveDocType === "factura" ? "factura" : "recibo"})
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-gray-500">Método de pago</div>
            <div className="font-semibold">{paymentMethodLabel(order.payment?.method)}</div>
            {order.payment?.reference && (
              <div className="text-xs text-gray-500 mt-1">
                Ref: {order.payment.reference}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-500">Moneda del pago</div>
            <div>{order.payment?.currency || "—"}</div>
            <div className="text-xs text-gray-500 mt-1">
              Monto cancelado: {fmtUSD(order.payment?.amountUSD || 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Fecha de pago</div>
            <div className="font-semibold">{formatDate(order.payment?.createdAt)}</div>
            <div className="text-xs text-gray-500">
              Estado del pago: {order.payment?.status || "—"}
            </div>
          </div>
        </div>
        {order.shippingAddress && (
          <div className="border-t pt-3 text-sm text-gray-700 space-y-1">
            <div className="text-xs text-gray-500">Dirección de envío</div>
            <div>{order.shippingAddress.fullname}</div>
            <div>
              {order.shippingAddress.address1}
              {order.shippingAddress.address2
                ? `, ${order.shippingAddress.address2}`
                : ""}
            </div>
            <div>
              {order.shippingAddress.city}, {order.shippingAddress.state}
            </div>
            {order.shippingAddress.phone && (
              <div>Tel: {order.shippingAddress.phone}</div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Productos de la venta</h2>
          <span className="text-xs text-gray-500">
            Items: {order.items.length}
          </span>
        </div>
        <div className="overflow-x-auto text-sm">
          <table className="w-full table-auto">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th className="px-2 py-1 text-left">Producto</th>
                <th className="px-2 py-1 text-right">Precio USD</th>
                <th className="px-2 py-1 text-right">Cantidad</th>
                <th className="px-2 py-1 text-right">Subtotal USD</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item: any) => (
                <tr key={item.id} className="border-t">
                  <td className="px-2 py-1">{item.name || item.product?.name}</td>
                  <td className="px-2 py-1 text-right">{fmtUSD(Number(item.priceUSD || 0))}</td>
                  <td className="px-2 py-1 text-right">{Number(item.quantity || 0)}</td>
                  <td className="px-2 py-1 text-right">
                    {fmtUSD(Number(item.priceUSD || 0) * Number(item.quantity || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow space-y-2 text-sm text-gray-600">
        <div>Subtotal USD: {fmtUSD(subtotalUSD)}</div>
        {effectiveDocType === "factura" && (
          <div>IVA ({ivaPercent}%): {fmtUSD((subtotalUSD * ivaPercent) / 100)}</div>
        )}
        <div className="font-semibold border-t pt-2">Total USD: {fmtUSD(totalUSD)}</div>
      </div>

      {order.notes && (
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-xs text-gray-500">Notas</div>
          <div className="text-sm text-gray-700">{order.notes}</div>
        </div>
      )}
    </div>
  );
}
