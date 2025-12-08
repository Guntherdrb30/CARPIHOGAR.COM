import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { redirect } from 'next/navigation';
import DeliveryPayoutForm from '@/components/admin/delivery-payout-form';

export const dynamic = 'force-dynamic';

function startOfDay(d: Date) { const x=new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x=new Date(d); x.setHours(23,59,59,999); return x; }
function toYmd(d: Date) { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }

export default async function DeliveryPagarPage({ searchParams }: { searchParams?: { user?: string; from?: string; to?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'ADMIN') redirect('/auth/login');

  const userId = String((searchParams as any)?.user || '');
  const parseDateParam = (v: unknown, fallback: Date) => { if (!v || typeof v !== 'string') return fallback; const d = new Date(v); return isNaN(d.getTime()) ? fallback : d; };
  const now = new Date();
  const isFirstHalf = now.getDate() <= 15;
  const defFrom = isFirstHalf ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), 16);
  const defTo = isFirstHalf ? new Date(now.getFullYear(), now.getMonth(), 15) : new Date(now.getFullYear(), now.getMonth()+1, 0);
  const from = parseDateParam((searchParams as any)?.from, defFrom);
  const to = parseDateParam((searchParams as any)?.to, defTo);
  const fromStr = toYmd(from); const toStr = toYmd(to);

  if (!userId) redirect(`/dashboard/admin/delivery/liquidaciones?from=${fromStr}&to=${toStr}`);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) redirect(`/dashboard/admin/delivery/liquidaciones?from=${fromStr}&to=${toStr}`);

  const orders = await prisma.order.findMany({
    where: {
      shipping: { carrier: 'DELIVERY' as any, assignedToId: userId, status: 'ENTREGADO' as any },
      shippingAddress: { is: { city: { equals: 'Barinas', mode: 'insensitive' } } as any },
      updatedAt: { gte: startOfDay(from) as any, lte: endOfDay(to) as any },
    },
    include: { shipping: true },
    orderBy: { updatedAt: 'desc' },
  });

  const pending = orders.filter(o => !o.shipping?.deliveryPaidAt);
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const driverPctRaw = (settings as any)?.deliveryDriverSharePct;
  const driverPct = (() => {
    const n = Number(driverPctRaw);
    if (!isFinite(n) || n <= 0 || n > 100) return 70;
    return n;
  })();
  const totalFee = pending.reduce((acc, o) => acc + parseFloat(String(o.shipping?.deliveryFeeUSD || 0)), 0);
  const totalDriver = totalFee * (driverPct / 100);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Registrar pago a Delivery</h1>
      <DeliveryPayoutForm
        deliveryUserId={user.id}
        userLabel={user.name || user.email}
        from={fromStr}
        to={toStr}
        pendingCount={pending.length}
        pendingTotalUSD={totalDriver}
      />
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
            {pending.map(o => (
              <tr key={o.id} className="border-b">
                <td className="px-3 py-2">{new Date((o as any).updatedAt).toLocaleString('es-VE')}</td>
                <td className="px-3 py-2">{o.id.slice(0,8)}</td>
                <td className="px-3 py-2">{o.shipping?.status}</td>
                <td className="px-3 py-2">Pendiente</td>
                <td className="px-3 py-2">${String(o.shipping?.deliveryFeeUSD || '')}</td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-gray-600">Sin entregas pendientes de pago en el rango.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
