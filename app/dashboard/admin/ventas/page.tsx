import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getSales,
  getCommissions,
  getSellers,
  markCommissionPaid,
  markSaleReviewed,
  sendOrderWhatsAppPdfByForm,
  deleteCreditSale,
} from "@/server/actions/sales";
import { getAllyPendingSalesCount } from "@/server/actions/ally-admin";

export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    sellerId?: string;
    message?: string;
    orderId?: string;
    docType?: string;
    invoice?: string;
    cliente?: string;
    rif?: string;
  }>;
}) {
  const sp = ((await searchParams) || {}) as any;
  const sellerId = sp.sellerId || "";
  const message = sp.message || "";
  const orderId = (sp.orderId || "") as string;
  const docTypeParam = String(sp.docType || "").toLowerCase();
  const invoiceQ = String(sp.invoice || "").trim();
  const clienteQ = String(sp.cliente || "").trim();
  const rifQ = String(sp.rif || "").trim();
  const session = await getServerSession(authOptions);
  const user = (session?.user as any) || {};
  const userEmail = String(user.email || "").toLowerCase();
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  const isRoot = user.role === "ADMIN" && userEmail === rootEmail;

  const [orders, commissions, sellers] = await Promise.all([
    getSales({
      sellerId: sellerId || undefined,
      invoice: invoiceQ || undefined,
      cliente: clienteQ || undefined,
      rif: rifQ || undefined,
    }),
    getCommissions(),
    getSellers(),
  ]);

  let allyPendingCount = 0;
  try {
    allyPendingCount = await getAllyPendingSalesCount();
  } catch {
    allyPendingCount = 0;
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Ventas</h1>
      <div className="text-sm">
        <a href="/dashboard/admin/ventas/espera" className="text-blue-600 hover:underline">
          Ver ventas en espera
        </a>
      </div>

      {message && (
        <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded space-y-2">
          <div>{message}</div>
          {orderId && (
            <div className="flex flex-wrap gap-2 text-sm">
              {(docTypeParam !== "factura") && (
                <a
                  href={`/dashboard/admin/ventas/${orderId}/print?tipo=recibo`}
                  target="_blank"
                  className="px-2 py-1 border rounded bg-white text-gray-800"
                >
                  Imprimir recibo
                </a>
              )}
              {(docTypeParam !== "recibo") && (
                <a
                  href={`/dashboard/admin/ventas/${orderId}/print?tipo=factura`}
                  target="_blank"
                  className="px-2 py-1 border rounded bg-white text-gray-800"
                >
                  Imprimir factura
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {allyPendingCount > 0 && (
        <div className="border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 rounded">
          Hay {allyPendingCount} venta
          {allyPendingCount === 1 ? "" : "s"} de aliados por verificar.{" "}
          <a href="/dashboard/admin/ventas/aliados" className="underline">
            Revisar ahora
          </a>
        </div>
      )}

      <form
        method="get"
        className="bg-white p-4 rounded-lg shadow grid grid-cols-1 md:grid-cols-5 gap-3"
      >
        <div className="md:col-span-1">
          <select
            name="sellerId"
            defaultValue={sellerId}
            className="border rounded px-2 py-1 w-full"
          >
            <option value="">Todos los vendedores</option>
            {sellers.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name || s.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <input
            name="invoice"
            defaultValue={invoiceQ}
            placeholder="Factura/Recibo/Orden"
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <div>
          <input
            name="cliente"
            defaultValue={clienteQ}
            placeholder="Cliente (nombre/email)"
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <div>
          <input
            name="rif"
            defaultValue={rifQ}
            placeholder="Cédula/RIF"
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <div className="flex gap-2">
          <button className="bg-blue-600 text-white px-3 py-1 rounded">
            Filtrar
          </button>
          <a
            href="/dashboard/admin/ventas"
            className="px-3 py-1 rounded border text-gray-700"
          >
            Limpiar
          </a>
        </div>
      </form>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Listado de Ventas</h2>
        <details className="rounded border border-gray-200" open>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">
            Ver ventas
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="px-2 py-1 text-left">Fecha</th>
                  <th className="px-2 py-1 text-left">Cliente</th>
                  <th className="px-2 py-1 text-left">Vendedor</th>
                  <th className="px-2 py-1 text-right w-24">Total USD</th>
                  <th className="px-2 py-1 text-left w-28">Estado</th>
                  <th className="px-2 py-1 text-left">Pago</th>
                  <th className="px-2 py-1 text-left w-32">Revisión</th>
                  <th className="px-2 py-1 text-left w-40">Soportes</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o: any) => {
                  const isReviewed = !!o.reviewedAt;
                  const origin = (o.originChannel || "ONLINE").toUpperCase();
                  let originLabel = "Online";
                  let originClass =
                    "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700";

                  if (origin === "ERP") {
                    originLabel = "ERP / Aliado";
                    originClass =
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700";
                  }

                  const canPrint =
                    o.status === "PAGADO" || o.status === "COMPLETADO";
                  const canShowDocs = canPrint && isReviewed;
                  const docType = String((o as any).documentType || "").toUpperCase();
                  const docChoice =
                    docType === "RECIBO" ? "recibo" : docType === "FACTURA" ? "factura" : "";

                  const invoiceNumber = (o as any).invoiceNumber as
                    | number
                    | null
                    | undefined;
                  const receiptNumber = (o as any).receiptNumber as
                    | number
                    | null
                    | undefined;
                  const docLabel =
                    docType === "FACTURA" && invoiceNumber
                      ? `Factura: ${invoiceNumber.toString().padStart(10, "0")}`
                      : docType === "RECIBO" && receiptNumber
                      ? `Recibo: ${receiptNumber.toString().padStart(10, "0")}`
                      : o.id
                      ? `Orden: ${String(o.id).slice(-6)}`
                      : "";
                  const isCredit = String(o.saleType || "").toUpperCase() === "CREDITO";
                  const statusValue = String(o.status || "").toUpperCase();
                  const canDeleteCreditSale =
                    isRoot &&
                    isCredit &&
                    !o.payment &&
                    !["PAGADO", "COMPLETADO"].includes(statusValue);

                  return (
                    <tr key={o.id} className="border-t align-top">
                      <td className="px-2 py-1 align-top whitespace-nowrap text-xs sm:text-sm">
                        <div>{new Date(o.createdAt).toLocaleString()}</div>
                        {docLabel && (
                          <div className="text-[11px] text-gray-500">
                            {docLabel}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 align-top">
                        <div className="font-medium">
                          {o.user?.name || o.user?.email}
                        </div>
                        <div className="text-xs text-gray-500 break-words">
                          {o.user?.email}
                        </div>
                      </td>
                      <td className="px-2 py-1 align-top">
                        {o.seller ? (
                          <>
                            <div>{o.seller.name || o.seller.email}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {origin && (
                                <span className={originClass}>{originLabel}</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-gray-500">
                            Sin vendedor
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 align-top text-right">
                        {Number(o.totalUSD).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {(() => {
                          const status = String(o.status || "").toUpperCase();
                          let badgeClass =
                            "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700";

                          if (status === "PENDIENTE" || status === "CONFIRMACION") {
                            badgeClass =
                              "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700";
                          } else if (status === "PAGADO" || status === "COMPLETADO") {
                            badgeClass =
                              "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700";
                          } else if (status === "CANCELADO" || status === "RECHAZADO") {
                            badgeClass =
                              "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700";
                          }

                          return <span className={badgeClass}>{status}</span>;
                        })()}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {o.payment ? (
                          <div className="space-y-1 text-xs sm:text-sm max-w-xs break-words">
                            <div>
                              {o.payment.method} ({o.payment.currency})
                            </div>
                            <div className="text-xs text-gray-600">
                              Estatus: {o.payment.status}
                            </div>
                            {o.payment.reference && (
                              <div className="text-xs text-gray-600">
                                Ref: {o.payment.reference}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            Sin pago registrado
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 align-top">
                        <div className="flex flex-col gap-1">
                          <div
                            className={
                              "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold " +
                              (isReviewed
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700")
                            }
                          >
                            {isReviewed ? "Revisada" : "Por revisar"}
                          </div>
                          {isReviewed && o.reviewedBy && (
                            <div className="text-[11px] text-gray-500">
                              Por: {o.reviewedBy.name || o.reviewedBy.email}
                            </div>
                          )}
                          {!isReviewed && (
                            <form action={markSaleReviewed} className="mt-1">
                              <input type="hidden" name="orderId" value={o.id} />
                              <button
                                className="text-xs text-blue-600 hover:underline"
                                type="submit"
                              >
                                Marcar como revisada
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1 align-top text-xs">
                        {canShowDocs ? (
                          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                            <span className="text-gray-600">PDF:</span>
                            {(docChoice !== "factura") && (
                              <a
                                className="px-2 py-0.5 border rounded whitespace-nowrap"
                                target="_blank"
                                href={`/api/orders/${o.id}/pdf?tipo=recibo&moneda=VES`}
                              >
                                Recibo
                              </a>
                            )}
                            {(docChoice !== "recibo") && (
                              <a
                                className="px-2 py-0.5 border rounded whitespace-nowrap"
                                target="_blank"
                                href={`/api/orders/${o.id}/pdf?tipo=factura&moneda=VES`}
                              >
                                Factura
                              </a>
                            )}
                            {o.user?.phone && (
                              <form
                                action={sendOrderWhatsAppPdfByForm}
                                className="inline-flex"
                              >
                                <input type="hidden" name="orderId" value={o.id} />
                                <input
                                  type="hidden"
                                  name="tipo"
                                  value={docChoice || "factura"}
                                />
                                <input type="hidden" name="moneda" value="VES" />
                                <input
                                  type="hidden"
                                  name="backTo"
                                  value="/dashboard/admin/ventas"
                                />
                                <button
                                  type="submit"
                                  className="px-2 py-0.5 border rounded text-green-700 whitespace-nowrap"
                                >
                                  WhatsApp PDF
                                </button>
                              </form>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">
                            {canPrint
                              ? "Marque la venta como revisada para ver soportes."
                              : "Sin documentos disponibles."}
                          </span>
                        )}
                        {canDeleteCreditSale && (
                          <form action={deleteCreditSale} className="mt-2">
                            <input type="hidden" name="orderId" value={o.id} />
                            <button
                              type="submit"
                              className="px-2 py-0.5 border border-red-200 rounded text-xs text-red-700 bg-red-50 hover:bg-red-100"
                            >
                              Eliminar venta crédito
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Comisiones</h2>
        <details className="rounded border border-gray-200" open>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">
            Ver comisiones
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="px-2 py-1 text-left w-40">Fecha</th>
                  <th className="px-2 py-1 text-left w-48">Vendedor</th>
                  <th className="px-2 py-1 text-left w-28">Orden</th>
                  <th className="px-2 py-1 text-left w-16">%</th>
                  <th className="px-2 py-1 text-left w-32">Monto USD</th>
                  <th className="px-2 py-1 text-left">Estatus</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c: any) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-2 py-1 align-top">
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 align-top">
                      {c.seller?.name || c.seller?.email}
                    </td>
                    <td className="px-2 py-1 align-top">{c.orderId}</td>
                    <td className="px-2 py-1 align-top">
                      {Number(c.percent).toFixed(2)}
                    </td>
                    <td className="px-2 py-1 align-top">
                      {Number(c.amountUSD).toFixed(2)}
                    </td>
                    <td className="px-2 py-1 align-top">
                      {c.status}
                      {c.status === "PENDIENTE" && (
                        <form
                          action={markCommissionPaid}
                          className="inline-block ml-2"
                        >
                          <input
                            type="hidden"
                            name="commissionId"
                            value={c.id}
                          />
                          <button
                            className="text-blue-600 hover:underline text-xs"
                            type="submit"
                          >
                            Marcar pagada
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}
