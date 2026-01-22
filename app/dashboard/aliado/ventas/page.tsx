import { getMySalesAsAlly } from "@/server/actions/ally";
import { sendOrderWhatsAppByForm } from "@/server/actions/sales";
import PdfCopyMenu from "@/components/pdf-copy-menu";

export default async function VentasAliadoPage({ searchParams }: { searchParams?: Promise<{ message?: string; orderId?: string }> }) {
  const sp = (await searchParams) || ({} as any);
  const message = (sp as any).message as string | undefined;
  const orderId = (sp as any).orderId as string | undefined;
  const orders = await getMySalesAsAlly();
  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis Ventas</h1>
        <a href="/dashboard/aliado/ventas/nueva" className="bg-green-600 text-white px-3 py-1 rounded">Nueva Venta</a>
      </div>
      {message && (
        <div className="flex items-center justify-between border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">
          <span>{message}</span>
          {orderId && (
            <form action={sendOrderWhatsAppByForm}>
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="backTo" value="/dashboard/aliado/ventas" />
              <button className="px-3 py-1 rounded border">Enviar WhatsApp</button>
            </form>
          )}
        </div>
      )}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Total USD</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Acciones</th>
                <th className="px-3 py-2">Comprobantes</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id}>
                  <td className="border px-3 py-2">{o.id.slice(-6)}</td>
                  <td className="border px-3 py-2">{o.user?.name || o.user?.email}</td>
                  <td className="border px-3 py-2 text-center">
                    {o.payment?.status === 'RECHAZADO' ? (
                      <span className="text-red-700 font-semibold">Pago rechazado</span>
                    ) : (
                      o.status === 'CONFIRMACION' || o.payment?.status === 'EN_REVISION' ? (
                        <span className="text-red-700 font-semibold">Venta por verificar</span>
                      ) : (
                        <span className="text-green-700 font-semibold">Venta verificada</span>
                      )
                    )}
                  </td>
                  <td className="border px-3 py-2 text-right">{Number(o.totalUSD).toFixed(2)}</td>
                  <td className="border px-3 py-2">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="border px-3 py-2 text-right">
                    <form action={sendOrderWhatsAppByForm}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <input type="hidden" name="backTo" value="/dashboard/aliado/ventas" />
                      <button className="text-green-700 hover:underline" type="submit">WhatsApp</button>
                    </form>
                  </td>
                  <td className="border px-3 py-2">
                    {(() => {
                      const docType = String((o as any).documentType || "").toUpperCase();
                      const docChoice =
                        docType === "RECIBO" ? "recibo" : docType === "FACTURA" ? "factura" : "";
                      return (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">Ver:</span>
                        {docChoice !== "factura" && (
                          <a
                            className="px-2 py-0.5 border rounded"
                            target="_blank"
                            href={`/dashboard/aliado/ventas/${o.id}/print?tipo=recibo`}
                          >
                            Recibo
                          </a>
                        )}
                        {docChoice !== "recibo" && (
                          <a
                            className="px-2 py-0.5 border rounded"
                            target="_blank"
                            href={`/dashboard/aliado/ventas/${o.id}/print?tipo=factura`}
                          >
                            Factura
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">PDF:</span>
                        {docChoice !== "factura" && (
                          <a
                            className="px-2 py-0.5 border rounded"
                            target="_blank"
                            href={`/api/orders/${o.id}/pdf?tipo=recibo&moneda=VES`}
                          >
                            Recibo
                          </a>
                        )}
                        {docChoice !== "recibo" && (
                          <a
                            className="px-2 py-0.5 border rounded"
                            target="_blank"
                            href={`/api/orders/${o.id}/pdf?tipo=factura&moneda=VES`}
                          >
                            Factura
                          </a>
                        )}
                        <PdfCopyMenu
                          orderId={o.id}
                          defaultTipo={docChoice || "factura"}
                          defaultMoneda="VES"
                          hasPhone={!!o.user?.phone}
                          backTo="/dashboard/aliado/ventas"
                        />
                      </div>
                      {o.user?.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">Compartir:</span>
                          <a
                            className="px-2 py-0.5 border rounded text-green-700"
                            target="_blank"
                            href={(function(){
                              const tipo = docChoice || 'factura';
                              const pdf = `${process.env.NEXT_PUBLIC_URL || ''}/api/orders/${o.id}/pdf?tipo=${tipo}&moneda=VES`;
                              const code = o.id.slice(-6);
                              const label = tipo === 'recibo' ? 'recibo' : 'factura';
                              const body = `Hola ${o.user?.name || 'cliente'}! Te comparto tu ${label} #${code}: ${pdf}`;
                              const phone = String(o.user?.phone || '').replace(/[^0-9]/g,'');
                              return `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
                            })()}
                            rel="noreferrer"
                          >WhatsApp</a>
                        </div>
                      )}
                    </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
