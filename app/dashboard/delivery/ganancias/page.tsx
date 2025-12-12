import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { redirect } from 'next/navigation';

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); const day = x.getDay(); const diff = (day === 0 ? 6 : day - 1); x.setDate(x.getDate() - diff); return x; }
function startOfMonth(d: Date) { const x = startOfDay(d); x.setDate(1); return x; }
function toYmd(d: Date) { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }

export default async function DeliveryEarningsPage({ searchParams }: { searchParams?: { from?: string; to?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'DELIVERY') redirect('/auth/login?callbackUrl=/dashboard/delivery/ganancias');
  const meId = (session.user as any).id as string;

  const now = new Date();
  const defFrom = startOfMonth(now);
  const defTo = now;

  const fromParam = (searchParams as any)?.from as string | undefined;
  const toParam = (searchParams as any)?.to as string | undefined;
  const fromDate = fromParam ? new Date(fromParam) : defFrom;
  const toDate = toParam ? new Date(toParam) : defTo;

  const orders = await prisma.order.findMany({
    where: {
      shipping: { carrier: 'DELIVERY' as any, assignedToId: meId, status: 'ENTREGADO' as any },
      shippingAddress: { is: { city: { equals: 'Barinas', mode: 'insensitive' } } as any },
    },
    include: { shipping: true, shippingAddress: true },
    orderBy: { updatedAt: 'desc' },
  });

  const deliveredAt = (o: any) => new Date(o.shipping?.updatedAt || (o as any).updatedAt);
  const sumFee = (arr: any[]) => arr.reduce((acc, o: any) => acc + parseFloat(String(o.shipping?.deliveryFeeUSD || 0)), 0);
  const sumTips = (arr: any[]) => arr.reduce((acc, o: any) => acc + parseFloat(String(o.shipping?.tipUSD || 0)), 0);

  const d0 = startOfDay(now); const w0 = startOfWeek(now); const m0 = startOfMonth(now);
  const today = orders.filter(o => deliveredAt(o) >= d0);
  const week = orders.filter(o => deliveredAt(o) >= w0);
  const month = orders.filter(o => deliveredAt(o) >= m0);

  // Periodo quincenal actual
  const periodNow = (() => { const now2 = new Date(); const y=now2.getFullYear(), m=now2.getMonth(); const from = new Date(y, m, now2.getDate() <= 15 ? 1 : 16); const to = new Date(y, m, now2.getDate() <= 15 ? 15 : new Date(y, m+1, 0).getDate()); return { from, to }; })();
  const inCurrentPeriod = orders.filter(o => { const d = deliveredAt(o); return d >= startOfDay(periodNow.from) && d <= endOfDay(periodNow.to); });
  const periodPending = inCurrentPeriod.filter(o => !o.shipping?.deliveryPaidAt);
  const periodPaid = inCurrentPeriod.filter(o => !!o.shipping?.deliveryPaidAt);

  // Rango seleccionado
  const inRange = orders.filter(o => deliveredAt(o) >= startOfDay(fromDate) && deliveredAt(o) <= endOfDay(toDate));

  const ratedByClients = orders.filter((o: any) => typeof o.shipping?.clientRating === 'number');
  const avgRating =
    ratedByClients.length > 0
      ? ratedByClients.reduce((acc: number, o: any) => acc + Number(o.shipping.clientRating || 0), 0) / ratedByClients.length
      : null;

  // Agrupar por día
  const groups = new Map<string, any[]>();
  for (const o of inRange) { const k = toYmd(deliveredAt(o)); const a = groups.get(k) || []; a.push(o); groups.set(k, a); }
  const grouped = Array.from(groups.entries()).sort((a,b) => a[0] < b[0] ? 1 : -1);

  const qs = (p: Record<string,string>) => new URLSearchParams(p).toString();
  const fromStr = toYmd(fromDate); const toStr = toYmd(toDate);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Ganancias</h1>

      <form method="get" className="bg-white rounded shadow p-4 flex flex-col md:flex-row gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Desde</label>
          <input type="date" name="from" defaultValue={fromStr} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Hasta</label>
          <input type="date" name="to" defaultValue={toStr} className="border rounded px-2 py-1" />
        </div>
        <button className="px-3 py-2 rounded bg-blue-600 text-white">Filtrar</button>
        <a className="px-3 py-2 rounded border" href={`/api/delivery/ganancias/detalle?${qs({ from: fromStr, to: toStr })}`}>CSV Detalle</a>
        <a className="px-3 py-2 rounded border" href={`/api/delivery/ganancias/resumen?${qs({ from: fromStr, to: toStr })}`}>CSV Resumen</a>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Hoy (envíos)</div>
          <div className="text-2xl font-bold">${sumFee(today).toFixed(2)}</div>
          <div className="text-xs text-gray-500">{today.length} entregas</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Esta semana (envíos)</div>
          <div className="text-2xl font-bold">${sumFee(week).toFixed(2)}</div>
          <div className="text-xs text-gray-500">{week.length} entregas</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Este mes (envíos)</div>
          <div className="text-2xl font-bold">${sumFee(month).toFixed(2)}</div>
          <div className="text-xs text-gray-500">{month.length} entregas</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Periodo actual</div>
          <div className="text-xs text-gray-500">{toYmd(periodNow.from)} &rarr; {toYmd(periodNow.to)}</div>
          <div className="text-sm text-gray-600">
            Pendiente: <span className="font-semibold">${sumFee(periodPending).toFixed(2)}</span> ({periodPending.length} envíos)
          </div>
          <div className="text-sm text-gray-600">
            Pagado: <span className="font-semibold">${sumFee(periodPaid).toFixed(2)}</span> ({periodPaid.length} envíos)
          </div>
        </div>
        <div className="bg-white rounded shadow p-4 md:col-span-1 space-y-1">
          <div className="text-xs text-gray-500">Resumen del rango</div>
          <div className="text-sm text-gray-600">
            Envíos: <span className="font-semibold">${sumFee(inRange).toFixed(2)}</span>
          </div>
          <div className="text-sm text-gray-600">
            Propinas: <span className="font-semibold">${sumTips(inRange).toFixed(2)}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">{fromStr} &rarr; {toStr}</div>
          {avgRating != null && (
            <div className="mt-2 text-xs text-gray-700">
              Valoración promedio de clientes:{' '}
              <span className="font-semibold">{avgRating.toFixed(2)} / 5</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded shadow">
        <div className="px-4 py-2 border-b font-semibold">Por día</div>
        <div className="divide-y">
          {grouped.map(([date, items]) => (
            <div key={date} className="p-4 flex items-center justify-between">
              <div className="text-sm">{date}</div>
              <div className="text-sm text-gray-600">{items.length} entregas</div>
              <div className="text-sm text-gray-600">Envíos: ${sumFee(items).toFixed(2)}</div>
              <div className="text-sm text-gray-600">Propinas: ${sumTips(items).toFixed(2)}</div>
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="p-4 text-gray-600">Sin entregas completadas en Barinas en el rango seleccionado.</div>
          )}
        </div>
      </div>
    </div>
  );
}
