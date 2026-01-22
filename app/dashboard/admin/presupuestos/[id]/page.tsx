import { getQuoteById, updateQuoteStatusByForm, updateQuoteExpiryByForm } from "@/server/actions/quotes";
import PrintButton from "@/components/print-button";

export default async function VerPresupuestoPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ message?: string }> }) {
  const { id } = await params;
  const [quote, sp] = await Promise.all([ getQuoteById(id), (async () => (await searchParams) || {})() ]);
  if (!quote) return <div className="container mx-auto p-4">Presupuesto no encontrado</div>;
  const message = (sp as any).message;

  const waText = encodeURIComponent(
    `Presupuesto ${quote.id}\nCliente: ${quote.user?.name || quote.user?.email}\nTotal: $${Number(quote.totalUSD).toFixed(2)}\nItems:\n` +
    quote.items.map((it:any)=>`- ${it.name} · ${it.quantity} x $${Number(it.priceUSD).toFixed(2)}`).join('\n')
  );

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Presupuesto {quote.id.slice(-6)}</h1>
        <div className="flex items-center gap-2">
          <a href="/dashboard/admin/presupuestos" className="border px-3 py-1 rounded">Volver</a>
          <a className="border px-3 py-1 rounded" target="_blank" href={`/dashboard/admin/presupuestos/${quote.id}/print`}>Imprimir</a>
          <a className="border px-3 py-1 rounded" target="_blank" href={`/api/quotes/${quote.id}/send`}>WhatsApp</a>
        </div>
      </div>
      {message && <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">{message}</div>}

      <div className="bg-white p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><div className="text-sm text-gray-600">Cliente</div><div>{quote.user?.name || quote.user?.email}</div></div>
          <div><div className="text-sm text-gray-600">Vendedor</div><div>{quote.seller?.name || quote.seller?.email || '—'}</div></div>
          <div><div className="text-sm text-gray-600">Total USD</div><div>${Number(quote.totalUSD).toFixed(2)}</div></div>
          <div><div className="text-sm text-gray-600">Estado</div><div className="font-semibold">{quote.status}</div></div>
          <div><div className="text-sm text-gray-600">Fecha</div><div>{new Date(quote.createdAt as any).toLocaleString()}</div></div>
          <div>
            <div className="text-sm text-gray-600">Vence</div>
            <div>{quote.expiresAt ? new Date(quote.expiresAt as any).toLocaleDateString() : '—'}</div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Acciones</h2>
        <div className="flex flex-wrap gap-2">
          <form action={updateQuoteStatusByForm}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="status" value="ENVIADO" />
            <button className="px-3 py-1 rounded border">Marcar Enviado</button>
          </form>
          <form action={updateQuoteStatusByForm}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="status" value="APROBADO" />
            <button className="px-3 py-1 rounded border">Aprobar</button>
          </form>
          <form action={updateQuoteStatusByForm}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="status" value="RECHAZADO" />
            <button className="px-3 py-1 rounded border">Rechazar</button>
          </form>
          <form action={updateQuoteStatusByForm}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="status" value="VENCIDO" />
            <button className="px-3 py-1 rounded border">Marcar Vencido</button>
          </form>
          <form method="get" action="/dashboard/admin/ventas/nueva" className="flex items-center gap-2">
            <input type="hidden" name="fromQuote" value={quote.id} />
            <label className="text-sm text-gray-700">Entrega local (Barinas)</label>
            <select name="shipping" className="form-select">
              <option value="">Automatica</option>
              <option value="RETIRO_TIENDA">Retiro en tienda</option>
              <option value="DELIVERY">Delivery (incluido)</option>
            </select>
            <button className="px-3 py-1 rounded bg-green-600 text-white" type="submit">Continuar a Venta</button>
          </form>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Vencimiento</h2>
        <form action={updateQuoteExpiryByForm} className="flex items-end gap-2">
          <input type="hidden" name="quoteId" value={quote.id} />
          <div>
            <label className="form-label">Fecha de vencimiento</label>
            <input type="date" name="expiresAt" defaultValue={quote.expiresAt ? new Date(quote.expiresAt as any).toISOString().slice(0,10) : ''} className="form-input" />
          </div>
          <button className="px-3 py-1 rounded border">Guardar</button>
        </form>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2">Precio USD</th>
                <th className="px-3 py-2">Cant.</th>
                <th className="px-3 py-2">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((it: any) => (
                <tr key={it.id}>
                  <td className="border px-3 py-2">{it.name}</td>
                  <td className="border px-3 py-2 text-right">{Number(it.priceUSD).toFixed(2)}</td>
                  <td className="border px-3 py-2 text-center">{it.quantity}</td>
                  <td className="border px-3 py-2 text-right">{(Number(it.priceUSD)*Number(it.quantity)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
