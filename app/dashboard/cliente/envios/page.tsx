import { getMyShipments, markShipmentReceived } from '@/server/actions/orders';

function formatDate(d: string | Date) {
  const dd = typeof d === 'string' ? new Date(d) : d;
  return dd.toLocaleString();
}

function carrierTrackingUrl(carrier?: string, tracking?: string) {
  if (!carrier || !tracking) return undefined;
  const code = String(tracking).trim();
  const c = String(carrier).toUpperCase();
  if (c === 'TEALCA') return `https://www.tealca.com/servicios/rastreo/?guia=${encodeURIComponent(code)}`;
  if (c === 'MRW') return `https://www.mrw.com.ve/rastreo?guia=${encodeURIComponent(code)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${carrier} ${code}`)}`;
}

export const dynamic = 'force-dynamic';

export default async function EnviosClientePage() {
  const orders = await getMyShipments();
  const baseUrl = process.env.NEXT_PUBLIC_URL || '';

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Mis Envíos</h1>
      {orders.length === 0 ? (
        <div className="text-gray-600">Aún no hay envíos registrados.</div>
      ) : (
        <div className="bg-white rounded shadow divide-y">
          {orders.map((o: any) => {
            const s = o.shipping || {};
            const url = carrierTrackingUrl(s.carrier, s.tracking);
            const pdfLink = `${baseUrl}/api/shipments/${o.id}/pdf`;
            const waMsg = `Hola, te comparto los datos de mi envío #${o.id.slice(0,8)}. Transportista: ${s.carrier || '-'}; Tracking: ${s.tracking || '-'}${url ? ` (${url})` : ''}. PDF: ${pdfLink}`;
            const delivered = String(s.status) === 'ENTREGADO';
            return (
              <div key={o.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <div className="text-gray-800 font-medium">Pedido #{o.id.slice(0,8)} • {formatDate(o.createdAt)}</div>
                  <div className="text-gray-700">Transportista: <span className="font-medium">{s.carrier || '-'}</span></div>
                  <div className="text-gray-700">Tracking: {s.tracking ? (
                    url ? <a className="text-blue-600 underline" href={url} target="_blank" rel="noreferrer">{s.tracking}</a> : <span className="font-mono">{s.tracking}</span>
                  ) : (<span>-</span>)}</div>
                  <div className="text-gray-700">Estado: {(() => {
                    const status = String(s.status || 'PENDIENTE');
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
                  })()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <a className="px-3 py-2 rounded border" href={`/api/shipments/${o.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                  <a className="px-3 py-2 rounded border text-green-600 border-green-600" href={`https://wa.me/?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                  {!delivered && (String(s.carrier || '') !== 'RETIRO_TIENDA') && (String(s.carrier || '') !== 'DELIVERY') && (
                    <form action={async (formData) => { 'use server'; await markShipmentReceived(formData.get('orderId') as string); }}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <button className="px-3 py-2 rounded bg-green-600 text-white">Producto recibido</button>
                    </form>
                  )}
                  {String(s.carrier || '') === 'DELIVERY' && (
                    <a
                      className="px-3 py-2 rounded border text-blue-600 border-blue-600"
                      href={`/dashboard/cliente/envios/mapa/${o.id}`}
                    >
                      Ver mapa
                    </a>
                  )}
                  <a className="px-3 py-2 rounded border" href={`/dashboard/cliente/pedidos/${o.id}`}>Ver pedido</a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

