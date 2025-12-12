import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const TIME_ZONE = 'America/Caracas';
const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const hmFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function toYmd(date: Date) {
  return ymdFormatter.format(date);
}

function toHm(date: Date) {
  return hmFormatter.format(date);
}

export default async function DeliveryHistoryPage({ searchParams }: { searchParams?: { debug?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'DELIVERY') redirect('/auth/login?callbackUrl=/dashboard/delivery/historial');
  const meId = (session.user as any).id as string;

  try {
    const orders = await prisma.order.findMany({
      where: {
        // Align filters with admin/liquidaciones (known-good)
        shipping: { carrier: 'DELIVERY' as any, assignedToId: meId, status: 'ENTREGADO' as any },
        shippingAddress: { is: { city: { equals: 'Barinas', mode: 'insensitive' } } as any },
      },
      include: { user: { select: { name: true, email: true, phone: true } }, shipping: true, shippingAddress: true },
      orderBy: { updatedAt: 'desc' },
    });

    const groups = new Map<string, typeof orders>();
    for (const o of orders) {
      const deliveredAt = new Date((o as any)?.shipping?.updatedAt || (o as any).updatedAt);
      const key = toYmd(deliveredAt);
      const arr = groups.get(key) || ([] as typeof orders);
      arr.push(o);
      groups.set(key, arr);
    }
    const grouped = Array.from(groups.entries()).sort((a,b) => a[0] < b[0] ? 1 : -1);

    return (
      <div className="container mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-bold">Historial de entregas</h1>
        {grouped.length === 0 && (
          <div className="text-gray-600">Aún no has completado entregas en Barinas.</div>
        )}
        {grouped.map(([date, items]) => (
          <div key={date} className="bg-white rounded shadow">
            <div className="px-4 py-2 border-b flex items-center justify-between">
              <div className="font-semibold">{date}</div>
              <div className="text-sm text-gray-600">{items.length} entregas</div>
            </div>
            <div className="divide-y">
              {items.map((o) => {
                const deliveredAt = new Date((o as any)?.shipping?.updatedAt || (o as any).updatedAt);
                const time = toHm(deliveredAt);
                const fee = (o as any)?.shipping?.deliveryFeeUSD;
                return (
                  <div key={o.id} className="p-4 flex items-center justify-between">
                    <div className="text-sm">
                      <div className="font-medium">Pedido #{o.id.slice(0,8)} • {o.user?.name || o.user?.email}</div>
                      <div className="text-gray-700">Dirección: {o.shippingAddress?.address1}, {o.shippingAddress?.city}</div>
                      <div className="text-gray-500">Entregado: {time}</div>
                    </div>
                    {fee ? (
                      <div className="text-sm font-semibold">${String(fee)}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  } catch (err) {
    console.error('Delivery historial render error:', err);
    return (
      <div className="container mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-bold">Historial de entregas</h1>
        <div className="text-red-600">Ocurrió un error al cargar tu historial. Intenta de nuevo más tarde.</div>
        {(searchParams as any)?.debug === '1' ? (
          <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap">
            {(err as any)?.name || 'Error'}: {(err as any)?.message || String(err)}
          </pre>
        ) : null}
      </div>
    );
  }
}
