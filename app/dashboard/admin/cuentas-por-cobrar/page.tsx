import prisma from "@/lib/prisma";
import { addReceivablePayment, markReceivablePaid, updateReceivableDueDate, sendReceivableReminder, runReceivablesReminderJob } from "@/server/actions/receivables";

export default async function CuentasPorCobrarPage({ searchParams }: { searchParams?: Promise<{ status?: string; bucket?: string; invoice?: string; cliente?: string; rif?: string }> }) {
  const sp = (await searchParams) || ({} as any);
  const statusFilter = (sp.status || 'TODOS').toUpperCase();
  const bucketFilter = (sp.bucket || 'TODOS').toUpperCase();
  const invoiceQ = String(sp.invoice || '').trim();
  const clienteQ = String(sp.cliente || '').trim();
  const rifQ = String(sp.rif || '').trim();

  const where: any = { saleType: 'CREDITO' };
  if (invoiceQ) where.id = { contains: invoiceQ };
  if (rifQ) (where as any).customerTaxId = { contains: rifQ, mode: 'insensitive' };
  if (clienteQ) (where as any).user = { is: { OR: [ { name: { contains: clienteQ, mode: 'insensitive' } as any }, { email: { contains: clienteQ, mode: 'insensitive' } as any } ] } };

  const orders = await prisma.order.findMany({
    where: where as any,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      seller: { select: { name: true, email: true } },
      receivable: { include: { entries: true, noteItems: true } },
    },
  });

  // Build computed rows
  const rows = orders.map((o) => {
    const abonadoUSD = (o.receivable?.entries || []).reduce((acc, e) => acc + Number((e as any).amountUSD), 0);
    const totalUSD = Number(o.totalUSD);
    const notes = (o.receivable as any)?.noteItems || [];
    const creditsUSD = notes
      .filter((n: any) => String(n.type) === 'CREDITO')
      .reduce((acc: number, n: any) => acc + Number(n.amountUSD || 0), 0);
    const debitsUSD = notes
      .filter((n: any) => String(n.type) === 'DEBITO')
      .reduce((acc: number, n: any) => acc + Number(n.amountUSD || 0), 0);
    const adjustedTotalUSD = totalUSD + debitsUSD - creditsUSD;
    const saldoUSD = Math.max(0, adjustedTotalUSD - abonadoUSD);
    const vence = (o.receivable?.dueDate || (o as any).creditDueDate || null) as Date | null;
    const estado = (o.receivable?.status || 'PENDIENTE') as string;
    const baseDate = vence ? new Date(vence) : new Date(o.createdAt as any);
    const today = new Date();
    const days = Math.floor((today.getTime() - baseDate.getTime()) / (1000*60*60*24));
    const bucket = days <= 10 ? '0-10' : days <= 20 ? '11-20' : days <= 30 ? '21-30' : 'VENCIDA';
    return { o, abonadoUSD, totalUSD, adjustedTotalUSD, creditsUSD, debitsUSD, saldoUSD, vence, estado, days, bucket };
  });

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'TODOS' && r.estado !== statusFilter) return false;
    if (bucketFilter !== 'TODOS' && r.bucket !== bucketFilter) return false;
    return true;
  });

  const bucketOrder = ['0-10','11-20','21-30','VENCIDA'] as const;
  const summary = bucketOrder.map((b) => {
    const items = filtered.filter((r) => r.bucket === b);
    const count = items.length;
    const saldo = items.reduce((acc, r) => acc + r.saldoUSD, 0);
    return { bucket: b, count, saldo };
  });

  // Global (no filtrado)
  const globalSummary = bucketOrder.map((b) => {
    const items = rows.filter((r) => r.bucket === b);
    const count = items.length;
    const saldo = items.reduce((acc, r) => acc + r.saldoUSD, 0);
    return { bucket: b, count, saldo };
  });
  const statusList = ['PENDIENTE','PARCIAL','PAGADO','CANCELADO'] as const;
  const statusSummary = statusList.map((s) => {
    const items = rows.filter((r) => r.estado === s);
    const count = items.length;
    const saldo = items.reduce((acc, r) => acc + r.saldoUSD, 0);
    return { status: s, count, saldo };
  });

  const globalTotalSaldo = rows.reduce((acc, r) => acc + r.saldoUSD, 0);
  const globalTotalCount = rows.length;
  const vencidasItems = rows.filter((r) => r.bucket === 'VENCIDA');
  const vencidasCount = vencidasItems.length;
  const vencidasSaldo = vencidasItems.reduce((acc, r) => acc + r.saldoUSD, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Cuentas por Cobrar</h1>

      {/* Filtros de búsqueda */}
      <form method="get" className="bg-white border rounded p-4 mb-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <label className="text-xs text-gray-600">Factura/Orden</label>
          <input name="invoice" defaultValue={invoiceQ} placeholder="N° orden o factura" className="border rounded px-2 py-1 w-full" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-gray-600">Cliente (nombre/email)</label>
          <input name="cliente" defaultValue={clienteQ} placeholder="Nombre o email" className="border rounded px-2 py-1 w-full" />
        </div>
        <div>
          <label className="text-xs text-gray-600">Cédula/RIF</label>
          <input name="rif" defaultValue={rifQ} placeholder="V-123… / J-123…" className="border rounded px-2 py-1 w-full" />
        </div>
        <div>
          <label className="text-xs text-gray-600">Estado</label>
          <select name="status" defaultValue={statusFilter} className="border rounded px-2 py-1 w-full">
            <option value="TODOS">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PARCIAL">Parcial</option>
            <option value="PAGADO">Pagado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600">Antigüedad</label>
          <select name="bucket" defaultValue={bucketFilter} className="border rounded px-2 py-1 w-full">
            <option value="TODOS">Todas</option>
            <option value="0-10">0-10</option>
            <option value="11-20">11-20</option>
            <option value="21-30">21-30</option>
            <option value="VENCIDA">Vencida</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="px-3 py-1 bg-blue-600 text-white rounded">Filtrar</button>
          <a href="/dashboard/admin/cuentas-por-cobrar" className="px-3 py-1 border rounded">Limpiar</a>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border rounded p-4">
          <div className="text-xs uppercase text-gray-500">Saldo Total</div>
          <div className="text-2xl font-semibold">${globalTotalSaldo.toFixed(2)}</div>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-xs uppercase text-gray-500">Cuentas</div>
          <div className="text-2xl font-semibold">{globalTotalCount}</div>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-gray-500">Vencidas</div>
              <div className="text-2xl font-semibold">{vencidasCount}</div>
              <div className="text-sm text-gray-600">Saldo: ${vencidasSaldo.toFixed(2)}</div>
            </div>
            <a
              className="px-3 py-2 border rounded text-sm"
              href={`?status=${encodeURIComponent(statusFilter)}&bucket=VENCIDA`}
            >Ver Vencidas</a>
          </div>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 items-center">
        <div className="text-sm">Resumen Global:
          {globalSummary.map(s => (
            <span key={s.bucket} className={`ml-2 px-2 py-1 rounded border ${s.bucket==='VENCIDA' ? 'bg-red-50' : s.bucket==='21-30' ? 'bg-yellow-50' : ''}`}>
              {s.bucket}: {s.count} • ${s.saldo.toFixed(2)}
            </span>
          ))}
        </div>
        <div className="text-sm ml-4">Por Estado:
          {statusSummary.map(s => (
            <span key={s.status} className="ml-2 px-2 py-1 rounded border">
              {s.status}: {s.count} • ${s.saldo.toFixed(2)}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 items-center">
        <div className="text-sm">Resumen (filtrado):
          {summary.map(s => (
            <span key={s.bucket} className={`ml-2 px-2 py-1 rounded border ${s.bucket==='VENCIDA' ? 'bg-red-50' : s.bucket==='21-30' ? 'bg-yellow-50' : ''}`}>
              {s.bucket}: {s.count} • ${s.saldo.toFixed(2)}
            </span>
          ))}
        </div>
        <a
          className="ml-auto px-3 py-1 border rounded"
          href={`/api/reports/receivables?status=${encodeURIComponent(statusFilter)}&bucket=${encodeURIComponent(bucketFilter)}&invoice=${encodeURIComponent(invoiceQ)}&cliente=${encodeURIComponent(clienteQ)}&rif=${encodeURIComponent(rifQ)}`}
          target="_blank"
        >Exportar CSV</a>
        <form action={runReceivablesReminderJob}>
          <button className="px-3 py-1 border rounded">Recordatorios vencidos</button>
        </form>
      </div>

      <form method="get" className="mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm text-gray-700">Factura/Orden</label>
          <input name="invoice" defaultValue={invoiceQ} className="border rounded px-2 py-1" placeholder="ID o parte" />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Cliente</label>
          <input name="cliente" defaultValue={clienteQ} className="border rounded px-2 py-1" placeholder="Nombre o email" />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Cédula/RIF</label>
          <input name="rif" defaultValue={rifQ} className="border rounded px-2 py-1" placeholder="V- / J-" />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Estado</label>
          <select name="status" defaultValue={statusFilter} className="border rounded px-2 py-1">
            {['TODOS','PENDIENTE','PARCIAL','PAGADO','CANCELADO'].map(s => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-700">Antigüedad</label>
          <select name="bucket" defaultValue={bucketFilter} className="border rounded px-2 py-1">
            {['TODOS','0-10','11-20','21-30','VENCIDA'].map(b => (<option key={b} value={b}>{b}</option>))}
          </select>
        </div>
        <button className="h-9 px-3 border rounded">Filtrar</button>
      </form>
      <div className="overflow-x-auto bg-white border rounded">
        <table className="min-w-full table-auto">
          <thead>
            <tr className="bg-gray-100 text-left text-sm">
              <th className="px-3 py-2"># Orden</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Vendedor</th>
              <th className="px-3 py-2">Total USD</th>
              <th className="px-3 py-2">Abonado USD</th>
              <th className="px-3 py-2">Saldo USD</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Vence</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ o, abonadoUSD, totalUSD, adjustedTotalUSD, creditsUSD, debitsUSD, saldoUSD, vence, estado, days, bucket }) => {
              const rowClass = bucket === 'VENCIDA' ? 'bg-red-50' : (bucket === '21-30' ? 'bg-yellow-50' : '');
              const phone = (o.user as any)?.phone as string | undefined;
              const msg = `Hola, le saludamos de ${(process.env.NEXT_PUBLIC_BRAND || 'Carpihogar')}. Orden ${o.id}. Saldo: $${saldoUSD.toFixed(2)}. ${vence ? 'Vence: '+new Date(vence).toLocaleDateString()+'. ' : ''}Agradecemos su pronto pago.`;
              const waHref = `https://api.whatsapp.com/send?${phone ? `phone=${encodeURIComponent(phone)}&` : ''}text=${encodeURIComponent(msg)}`;
              const receiptHref = `/dashboard/admin/ventas/${o.id}/print?tipo=recibo`;
              return (
                <tr key={o.id} className={`border-t align-top text-sm ${rowClass}`}>
                  <td className="px-3 py-2">{o.id.substring(0,8)}...</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{o.user?.name || o.user?.email || 'N/A'}</span>
                      {bucket === 'VENCIDA' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-600 text-white">VENCIDA</span>
                      )}
                      {(o.receivable?.notes || '').includes('OVERDUE_NOTIFIED') && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Notificado</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{o.seller?.name || o.seller?.email || '-'}</td>
                  <td className="px-3 py-2">
                    <div>${adjustedTotalUSD.toFixed(2)}</div>
                    {(creditsUSD !== 0 || debitsUSD !== 0) && (
                      <div className="text-xs text-gray-500">
                        Orig: ${totalUSD.toFixed(2)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">${abonadoUSD.toFixed(2)}</td>
                  <td className="px-3 py-2">${saldoUSD.toFixed(2)}</td>
                  <td className="px-3 py-2">{new Date(o.createdAt as any).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <form action={updateReceivableDueDate} className="space-y-1">
                      <input type="hidden" name="orderId" value={o.id} />
                      <input name="dueDate" type="date" defaultValue={vence ? new Date(vence as any).toISOString().slice(0,10) : ''} className="border rounded px-2 py-1" />
                      <button className="ml-1 px-2 py-1 border rounded">Guardar</button>
                    </form>
                    <div className="mt-1 text-xs text-gray-600">Antigüedad: {days} días ({bucket})</div>
                  </td>
                  <td className="px-3 py-2">{String(estado)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-2">
                      <form action={addReceivablePayment} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="orderId" value={o.id} />
                        <input name="paidAt" type="date" className="w-36 border rounded px-2 py-1" defaultValue={new Date().toISOString().slice(0,10)} />
                        <input name="amount" type="number" step="0.01" min="0" placeholder="Abono USD/VES" className="w-28 border rounded px-2 py-1" required />
                        <select name="currency" className="border rounded px-2 py-1">
                          <option value="USD">USD</option>
                          <option value="VES">VES</option>
                        </select>
                        <select name="method" className="border rounded px-2 py-1">
                          <option value="TRANSFERENCIA">Transferencia</option>
                          <option value="PAGO_MOVIL">Pago Móvil</option>
                          <option value="ZELLE">Zelle</option>
                        </select>
                        <input name="reference" placeholder="Referencia" className="border rounded px-2 py-1" />
                        <input name="notes" placeholder="Notas" className="border rounded px-2 py-1" />
                        <button className="px-2 py-1 bg-green-600 text-white rounded">Agregar abono</button>
                      </form>
                      <div className="flex gap-2">
                        <a className="px-2 py-1 border rounded" target="_blank" href={waHref}>WhatsApp</a>
                        <form action={sendReceivableReminder}>
                          <input type="hidden" name="orderId" value={o.id} />
                          <button className="px-2 py-1 border rounded">Enviar email</button>
                        </form>
                      </div>
                      {saldoUSD > 0 && (
                        <form action={markReceivablePaid}>
                          <input type="hidden" name="orderId" value={o.id} />
                          <button className="px-2 py-1 border rounded">Marcar Pagado</button>
                        </form>
                      )}
                      <a className="px-2 py-1 border rounded text-center" href={`/dashboard/admin/cuentas-por-cobrar/${o.id}`}>Ver cuenta por cobrar</a>
                      <a
                        className="px-2 py-1 border rounded text-center"
                        href={receiptHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver recibo
                      </a>
                      <a
                        className="px-2 py-1 border rounded text-center"
                        href={`/dashboard/admin/ventas/${o.id}/print`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Imprimir
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
