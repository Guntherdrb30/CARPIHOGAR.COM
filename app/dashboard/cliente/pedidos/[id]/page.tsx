import { getMyOrderById, submitDeliveryFeedback } from "@/server/actions/orders";
import { sendReceiptEmailByForm } from "@/server/actions/email_byform";

export default async function ClientePedidoDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: any = null;
  try {
    order = await getMyOrderById(id);
  } catch (e) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-white p-6 rounded-lg shadow">Pedido no encontrado</div>
      </div>
    );
  }

  const ivaPercent = Number(order.ivaPercent || 16);
  const subtotalUSD = Number(order.subtotalUSD || 0);
  const ivaUSD = (subtotalUSD * ivaPercent) / 100;
  const totalUSD = Number(order.totalUSD || (subtotalUSD + ivaUSD));
  const tasaVES = Number(order.tasaVES || 40);
  const totalVES = Number(order.totalVES || totalUSD * tasaVES);
  const shipping = order.shipping as any || null;
  const isLocalDelivery = shipping && String(shipping.carrier || '') === 'DELIVERY';
  const delivered = shipping && String(shipping.status || '') === 'ENTREGADO';
  const alreadyRated = Boolean(shipping?.clientConfirmedAt || shipping?.clientRating);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pedido {order.id.slice(-6)}</h1>
        <a href="/dashboard/cliente" className="text-sm border px-3 py-1 rounded">Volver</a>
      </div>

      <div className="bg-white p-4 rounded-lg shadow grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-gray-600 text-sm">Fecha</div>
          <div>{new Date(order.createdAt).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-600 text-sm">Estatus</div>
          <div className="font-semibold">{order.status}</div>
        </div>
        <div>
          <div className="text-gray-600 text-sm">Totales</div>
          <div>USD: ${totalUSD.toFixed(2)} · Bs: {(totalVES).toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Items</h2>
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-right">Precio USD</th>
              <th className="px-3 py-2 text-right">Cant.</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it: any) => {
              const price = Number(it.priceUSD);
              const sub = price * Number(it.quantity);
              return (
                <tr key={it.id}>
                  <td className="border px-3 py-2">{it.name}</td>
                  <td className="border px-3 py-2 text-right">{price.toFixed(2)}</td>
                  <td className="border px-3 py-2 text-right">{it.quantity}</td>
                  <td className="border px-3 py-2 text-right">{sub.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex justify-end mt-3">
          <div className="w-64 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>${subtotalUSD.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>IVA ({ivaPercent}%)</span><span>${ivaUSD.toFixed(2)}</span></div>
            <div className="flex justify-between font-semibold border-t mt-1 pt-1"><span>Total</span><span>${totalUSD.toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Pago</h2>
        {order.payment ? (
          <div className="text-sm space-y-1">
            <div>Método: {order.payment.method}</div>
            <div>Moneda: {order.payment.currency}</div>
            {order.payment.reference && <div>Referencia: {order.payment.reference}</div>}
            {order.payment.method === 'PAGO_MOVIL' && (
              <div className="text-gray-700">
                {order.payment.payerName && <div>Titular: {order.payment.payerName}</div>}
                {order.payment.payerPhone && <div>Teléfono: {order.payment.payerPhone}</div>}
                {order.payment.payerBank && <div>Banco: {order.payment.payerBank}</div>}
              </div>
            )}
            <div>Estatus: {order.payment.status}</div>
          </div>
        ) : (
          <div className="text-sm text-gray-600">Sin registro de pago</div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <a className="border px-3 py-1 rounded" href={`/dashboard/cliente/pedidos/${order.id}/print?tipo=recibo&moneda=USD`} target="_blank">Imprimir / PDF</a>
          <form action={sendReceiptEmailByForm} className="flex items-center gap-2">
            <input type="hidden" name="orderId" value={order.id} />
            <select name="tipo" className="border rounded px-2 py-1 text-sm">
              <option value="recibo">Recibo</option>
              <option value="nota">Nota</option>
              <option value="factura">Factura</option>
            </select>
            <select name="moneda" className="border rounded px-2 py-1 text-sm">
              <option value="USD">USD</option>
              <option value="VES">Bs (VES)</option>
            </select>
            <input name="to" type="email" defaultValue={order.user?.email || ''} placeholder="Email" className="border rounded px-2 py-1 text-sm" required />
            <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Enviar por email</button>
          </form>
        </div>
      </div>

      {order.shipping && (
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-2">Envío</h2>
          <div className="text-sm space-y-1">
            {order.shippingAddress && (
              <div>
                <h3 className="font-semibold">Dirección de Envío:</h3>
                <p>{order.shippingAddress.fullname}</p>
                <p>{order.shippingAddress.address1}, {order.shippingAddress.city}, {order.shippingAddress.state}</p>
                <p>{order.shippingAddress.phone}</p>
              </div>
            )}
            <div><span className="font-semibold">Transportista:</span> {order.shipping.carrier}</div>
            {order.shipping.tracking && <div><span className="font-semibold">Tracking:</span> {order.shipping.tracking}</div>}
            <div>
              <span className="font-semibold">Estado:</span>{' '}
              {(() => {
                const status = String(order.shipping.status || 'PENDIENTE');
                let badgeClass = 'bg-gray-100 text-gray-800';
                switch (status) {
                  case 'PENDIENTE':
                    badgeClass = 'bg-red-100 text-red-800';
                    break;
                  case 'ENTREGADO':
                    badgeClass = 'bg-green-100 text-green-800';
                    break;
                  case 'PREPARANDO':
                    badgeClass = 'bg-yellow-100 text-yellow-800';
                    break;
                  case 'DESPACHADO':
                    badgeClass = 'bg-blue-100 text-blue-800';
                    break;
                  case 'EN_TRANSITO':
                    badgeClass = 'bg-indigo-100 text-indigo-800';
                    break;
                  case 'INCIDENCIA':
                    badgeClass = 'bg-orange-100 text-orange-800';
                    break;
                }
                return (
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}>{status}</span>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {isLocalDelivery && delivered && (
        <div className="bg-white p-4 rounded-lg shadow space-y-3">
          <h2 className="text-lg font-bold mb-1">Tu experiencia con el Delivery</h2>
          <p className="text-sm text-gray-600">
            Confirma que recibiste el pedido y deja una valoración del servicio de delivery. También puedes dejar una propina opcional.
          </p>
          {alreadyRated ? (
            <div className="text-sm text-gray-700 space-y-1">
              <div>
                <span className="font-semibold">Tu valoración:</span>{' '}
                {shipping.clientRating ? `${shipping.clientRating} / 5` : 'No registrada'}
              </div>
              <div>
                <span className="font-semibold">Propina:</span>{' '}
                {shipping.tipUSD ? `$ ${Number(shipping.tipUSD).toFixed(2)}` : 'Sin propina'}
              </div>
              <div className="text-xs text-gray-500">
                Gracias por calificar el servicio. Esta información ayuda a mejorar la experiencia de delivery.
              </div>
            </div>
          ) : (
            <form
              action={async (formData) => {
                'use server';
                await submitDeliveryFeedback(formData);
              }}
              className="space-y-3 text-sm"
            >
              <input type="hidden" name="orderId" value={order.id} />
              <div className="flex flex-col md:flex-row md:items-center md:gap-4 gap-2">
                <label className="block">
                  <span className="block text-gray-700 mb-1">Valoración del delivery (1 a 5)</span>
                  <select
                    name="rating"
                    className="border rounded px-2 py-1 text-sm"
                    defaultValue="5"
                    required
                  >
                    <option value="">Selecciona</option>
                    <option value="5">5 - Excelente</option>
                    <option value="4">4 - Muy bueno</option>
                    <option value="3">3 - Aceptable</option>
                    <option value="2">2 - Regular</option>
                    <option value="1">1 - Malo</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-gray-700 mb-1">Propina al delivery (USD, opcional)</span>
                  <input
                    type="number"
                    name="tipUSD"
                    min="0"
                    step="0.5"
                    placeholder="Ej: 2"
                    className="border rounded px-2 py-1 text-sm w-32"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                Confirmar entrega y enviar valoración
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
