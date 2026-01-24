import { getAllyQuoteById, updateQuoteStatusByForm } from "@/server/actions/quotes";
import { getLatestAddressByUserId } from "@/server/actions/addresses";
import Link from "next/link";

export default async function VerPresupuestoAliadoPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ message?: string }> }) {
  const { id } = await params;
  const [quote, sp] = await Promise.all([ getAllyQuoteById(id), (async () => (await searchParams) || {})() ]);
  const latestAddr = await getLatestAddressByUserId(quote.userId);
  const message = (sp as any).message;
  const allySubtotal = quote.items.reduce((a: number, it: any) => a + Number((it.product?.priceAllyUSD ?? it.priceUSD)) * Number(it.quantity), 0);
  const allyIva = allySubtotal * (Number(quote.ivaPercent) / 100);
  const allyTotal = allySubtotal + allyIva;

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Presupuesto {quote.id.slice(-6)}</h1>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/aliado/presupuestos" className="border px-3 py-1 rounded">Volver</Link>
          <a className="border px-3 py-1 rounded" target="_blank" href={`/api/quotes/${quote.id}/send`}>WhatsApp</a>
          <a className="border px-3 py-1 rounded" target="_blank" href={`/dashboard/aliado/presupuestos/${quote.id}/print`}>Presupuesto Aliado</a>
          <Link className="border px-3 py-1 rounded" href={`/dashboard/aliado/presupuestos/${quote.id}/editar`}>Editar</Link>
        </div>
      </div>
      {message && <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">{message}</div>}

      <div className="bg-white p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><div className="text-sm text-gray-600">Cliente</div><div>{quote.user?.name || quote.user?.email}</div></div>
          <div><div className="text-sm text-gray-600">Total Cliente (USD)</div><div>${Number(quote.totalUSD).toFixed(2)}</div></div>
          <div><div className="text-sm text-gray-600">Total Aliado (estimado)</div><div className="font-semibold">${allyTotal.toFixed(2)}</div></div>
          <div><div className="text-sm text-gray-600">Estado</div><div className="font-semibold">{quote.status}</div></div>
          <div><div className="text-sm text-gray-600">Fecha</div><div>{new Date(quote.createdAt as any).toLocaleString()}</div></div>
          <div><div className="text-sm text-gray-600">Vence</div><div>{quote.expiresAt ? new Date(quote.expiresAt as any).toLocaleDateString() : '-'}</div></div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Acciones</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <form action={updateQuoteStatusByForm}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="status" value="ENVIADO" />
            <input type="hidden" name="backTo" value={`/dashboard/aliado/presupuestos/${quote.id}`} />
            <button className="px-3 py-1 rounded border">Marcar Enviado</button>
          </form>
          <form action={updateQuoteStatusByForm}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="status" value="APROBADO" />
            <input type="hidden" name="backTo" value={`/dashboard/aliado/presupuestos/${quote.id}`} />
            <button className="px-3 py-1 rounded border">Aprobar</button>
          </form>
          <form action={updateQuoteStatusByForm}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="status" value="RECHAZADO" />
            <input type="hidden" name="backTo" value={`/dashboard/aliado/presupuestos/${quote.id}`} />
            <button className="px-3 py-1 rounded border">Rechazar</button>
          </form>
          <span className="text-sm text-gray-600">Las ventas solo las crea un administrador.</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Datos de envío</h2>
        {latestAddr ? (
          <div className="text-sm text-gray-800">
            <div className="font-semibold">{latestAddr.fullname}</div>
            <div>{latestAddr.address1}{latestAddr.address2 ? `, ${latestAddr.address2}` : ''}</div>
            <div>{latestAddr.city}, {latestAddr.state}</div>
            {latestAddr.phone && <div>Teléfono: {latestAddr.phone}</div>}
            {latestAddr.zone && <div>Zona: {latestAddr.zone}</div>}
            {latestAddr.notes && <div className="text-gray-600">Notas: {latestAddr.notes}</div>}
          </div>
        ) : (
          <div className="text-sm text-gray-600">Sin dirección guardada aún. Puedes indicarla al crear el presupuesto.</div>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2">P1 (Cliente)</th>
                <th className="px-3 py-2">P2 (Aliado)</th>
                <th className="px-3 py-2">Cant.</th>
                <th className="px-3 py-2">Subtotal P1</th>
                <th className="px-3 py-2">Subtotal P2</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((it: any) => {
                const p1 = Number(it.priceUSD);
                const p2 = it.product?.priceAllyUSD != null ? Number(it.product.priceAllyUSD) : p1;
                const qty = Number(it.quantity);
                return (
                  <tr key={it.id}>
                    <td className="border px-3 py-2">{it.name}</td>
                    <td className="border px-3 py-2 text-right">${p1.toFixed(2)}</td>
                    <td className="border px-3 py-2 text-right">${p2.toFixed(2)}</td>
                    <td className="border px-3 py-2 text-center">{qty}</td>
                    <td className="border px-3 py-2 text-right">${(p1*qty).toFixed(2)}</td>
                    <td className="border px-3 py-2 text-right">${(p2*qty).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
