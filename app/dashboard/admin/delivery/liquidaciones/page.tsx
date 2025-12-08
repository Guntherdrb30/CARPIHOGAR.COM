import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { markPaidRange } from '@/server/actions/shipping';

export const dynamic = 'force-dynamic';

function startOfDay(d: Date) { const x=new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x=new Date(d); x.setHours(23,59,59,999); return x; }
function toYmd(d: Date) { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }

export default async function DeliveryLiquidacionesPage({ searchParams }: { searchParams?: { user?: string; from?: string; to?: string; q?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'ADMIN') redirect('/auth/login');

  const q = String((searchParams as any)?.q || '').trim();
  let deliveries: { id: string; name: string | null; email: string }[] = [];
  try {
    deliveries = await prisma.user.findMany({
      where: {
        role: 'DELIVERY' as any,
        ...(q ? { OR: [
          { name: { contains: q, mode: 'insensitive' } as any },
          { email: { contains: q, mode: 'insensitive' } as any },
        ] } : {}),
      },
      select: { id:true, name:true, email:true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      take: 200,
    });
  } catch (err) {
    console.error('[admin/liquidaciones] deliveries query failed', err);
  }
  const defaultUser = deliveries[0]?.id || '';

  const now = new Date();
  const isFirstHalf = now.getDate() <= 15;
  const defFrom = isFirstHalf ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), 16);
  const defTo = isFirstHalf ? new Date(now.getFullYear(), now.getMonth(), 15) : new Date(now.getFullYear(), now.getMonth()+1, 0);
  const defFromStr = toYmd(defFrom);
  const defToStr = toYmd(defTo);
  const parseDateParam = (v: unknown, fallback: Date) => {
    if (!v || typeof v !== 'string') return fallback;
    const d = new Date(v);
    return isNaN(d.getTime()) ? fallback : d;
  };
  const requestedUser = (searchParams as any)?.user as string | undefined;
  const selectedUser = deliveries.some(d => d.id === requestedUser) ? (requestedUser as string) : defaultUser;
  const from = parseDateParam((searchParams as any)?.from, defFrom);
  const to = parseDateParam((searchParams as any)?.to, defTo);

  const orders = selectedUser ? await (async () => {
    try {
      return await prisma.order.findMany({
        where: {
          shipping: { carrier: 'DELIVERY' as any, assignedToId: selectedUser, status: 'ENTREGADO' as any },
          shippingAddress: { is: { city: { equals: 'Barinas', mode: 'insensitive' } } as any },
          updatedAt: { gte: startOfDay(from) as any, lte: endOfDay(to) as any },
        },
        include: { shipping: true },
        orderBy: { updatedAt: 'desc' },
      });
    } catch (err) {
      console.error('[admin/liquidaciones] orders query failed', { selectedUser, from, to, err });
      return [] as any[];
    }
  })() : [];

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const driverPctRaw = (settings as any)?.deliveryDriverSharePct;
  const driverPct = (() => {
    const n = Number(driverPctRaw);
    if (!isFinite(n) || n <= 0 || n > 100) return 70;
    return n;
  })();
  const driverFactor = driverPct / 100;

  const sumFee = (arr: typeof orders) => arr.reduce((acc, o) => acc + parseFloat(String(o.shipping?.deliveryFeeUSD || 0)), 0);
  const pending = orders.filter(o => !o.shipping?.deliveryPaidAt);
  const paid = orders.filter(o => !!o.shipping?.deliveryPaidAt);
  const totalPendingFee = sumFee(pending);
  const totalPendingDriver = totalPendingFee * driverFactor;

  const fromStr = toYmd(from); const toStr = toYmd(to);

  const qs = (p: Record<string,string>) => new URLSearchParams(p).toString();

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Liquidaciones Delivery</h1>

      <form method="get" className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Buscar (nombre o email)</label>
          <input name="q" defaultValue={q} placeholder="Ej: Juan o @correo" className="border rounded px-2 py-1 w-full" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Delivery</label>
          <select name="user" defaultValue={selectedUser} className="border rounded px-2 py-1 w-full">
            {deliveries.map(d => (<option key={d.id} value={d.id}>{d.name || d.email}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Desde</label>
          <input type="date" name="from" defaultValue={fromStr} className="border rounded px-2 py-1 w-full" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Hasta</label>
          <input type="date" name="to" defaultValue={toStr} className="border rounded px-2 py-1 w-full" />
        </div>
        <div>
          <button className="px-3 py-2 rounded bg-blue-600 text-white w-full">Filtrar</button>
        </div>
        <div>
          <a className="px-3 py-2 rounded border w-full inline-block text-center" href={`/dashboard/admin/delivery/liquidaciones?${new URLSearchParams({ user: String(selectedUser), from: defFromStr, to: defToStr }).toString()}`}>Periodo actual</a>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">En rango</div>
          <div className="text-2xl font-bold">{orders.length}</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Pendientes</div>
          <div className="text-2xl font-bold">{pending.length}</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Pagadas</div>
          <div className="text-2xl font-bold">{paid.length}</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Total a pagar al delivery</div>
          <div className="text-2xl font-bold">${totalPendingDriver.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-1">
            Fee cliente: ${totalPendingFee.toFixed(2)} · {driverPct}% delivery
          </div>
        </div>
      </div>

        <div className="flex items-center gap-3">
          {selectedUser ? (
            <>
              <a className="px-3 py-2 rounded border" href={`/api/admin/delivery/ganancias/detalle?${qs({ deliveryUserId: selectedUser, from: fromStr, to: toStr })}`}>CSV Detalle</a>
              <a className="px-3 py-2 rounded border" href={`/api/admin/delivery/ganancias/resumen?${qs({ deliveryUserId: selectedUser, from: fromStr, to: toStr })}`}>CSV Resumen</a>
              <a className="px-3 py-2 rounded bg-green-600 text-white" href={`/dashboard/admin/delivery/liquidaciones/pagar?${qs({ user: String(selectedUser), from: fromStr, to: toStr })}`}>Continuar a pago</a>
            </>
          ) : (
            <>
              <button className="px-3 py-2 rounded border opacity-50 cursor-not-allowed" disabled>CSV Detalle</button>
              <button className="px-3 py-2 rounded border opacity-50 cursor-not-allowed" disabled>CSV Resumen</button>
              <button className="px-3 py-2 rounded bg-green-600 text-white opacity-50 cursor-not-allowed" disabled>Continuar a pago</button>
            </>
          )}
        </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Orden</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Pago</th>
              <th className="px-3 py-2">Fee</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} className="border-b">
                <td className="px-3 py-2">{new Date((o as any).updatedAt).toLocaleString('es-VE')}</td>
                <td className="px-3 py-2">{o.id.slice(0,8)}</td>
                <td className="px-3 py-2">{o.shipping?.status}</td>
                <td className="px-3 py-2">{o.shipping?.deliveryPaidAt ? new Date(o.shipping.deliveryPaidAt as any).toLocaleDateString('es-VE') : 'Pendiente'}</td>
                <td className="px-3 py-2">${String(o.shipping?.deliveryFeeUSD || '')}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-gray-600">Sin entregas ENTREGADO en el rango.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
