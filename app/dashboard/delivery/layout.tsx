import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { redirect } from 'next/navigation';

function formatUsd(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `US$ ${safe.toFixed(2)}`;
}

export default async function DeliveryLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/auth/login?callbackUrl=/dashboard/delivery');
  if ((session.user as any)?.role !== 'DELIVERY') {
    redirect('/auth/login?message=You Are Not Authorized!');
  }

  const meId = (session.user as any)?.id as string;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const barinasFilter = {
    order: {
      shippingAddress: {
        is: {
          city: { equals: 'Barinas', mode: 'insensitive' },
        },
      },
    },
  } as const;

  const [activeDeliveries, deliveredLast30, earningsPendingAgg] = await Promise.all([
    prisma.shipping.count({
      where: {
        carrier: 'DELIVERY',
        assignedToId: meId,
        status: { in: ['PENDIENTE', 'PREPARANDO', 'DESPACHADO', 'EN_TRANSITO'] },
        ...barinasFilter,
      },
    }),
    prisma.shipping.count({
      where: {
        carrier: 'DELIVERY',
        assignedToId: meId,
        status: 'ENTREGADO',
        updatedAt: { gte: thirtyDaysAgo },
        ...barinasFilter,
      },
    }),
    prisma.shipping.aggregate({
      where: {
        carrier: 'DELIVERY',
        assignedToId: meId,
        status: 'ENTREGADO',
        deliveryPaidAt: null,
        ...barinasFilter,
      },
      _sum: { deliveryFeeUSD: true, tipUSD: true },
    }),
  ]);

  const pendingFees =
    typeof earningsPendingAgg._sum.deliveryFeeUSD !== 'undefined' && earningsPendingAgg._sum.deliveryFeeUSD !== null
      ? parseFloat(String(earningsPendingAgg._sum.deliveryFeeUSD))
      : 0;
  const pendingTips =
    typeof earningsPendingAgg._sum.tipUSD !== 'undefined' && earningsPendingAgg._sum.tipUSD !== null
      ? parseFloat(String(earningsPendingAgg._sum.tipUSD))
      : 0;
  const pendingTotal = pendingFees + pendingTips;

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <a className="flex flex-col rounded border px-3 py-2 hover:bg-gray-50" href="/dashboard/delivery">
          <span className="font-semibold">Pendientes</span>
          <span className="text-xs text-gray-500" suppressHydrationWarning>
            {activeDeliveries === 0
              ? 'Sin entregas activas'
              : `${activeDeliveries} entrega${activeDeliveries === 1 ? '' : 's'} activas`}
          </span>
        </a>
        <a className="flex flex-col rounded border px-3 py-2 hover:bg-gray-50" href="/dashboard/delivery/historial">
          <span className="font-semibold">Entregadas</span>
          <span className="text-xs text-gray-500" suppressHydrationWarning>
            {deliveredLast30 === 0
              ? 'Sin entregas recientes'
              : `${deliveredLast30} en los Últimos 30 días`}
          </span>
        </a>
        <a className="flex flex-col rounded border px-3 py-2 hover:bg-gray-50" href="/dashboard/delivery/ganancias">
          <span className="font-semibold">Ganancias</span>
          <span className="text-xs text-gray-500" suppressHydrationWarning>
            {pendingTotal > 0 ? `${formatUsd(pendingTotal)} por liquidar` : 'Sin pagos pendientes'}
          </span>
        </a>
        <a className="flex flex-col rounded border px-3 py-2 hover:bg-gray-50" href="/dashboard/delivery/perfil">
          <span className="font-semibold">Perfil de pagos</span>
          <span className="text-xs text-gray-500">Actualiza tus datos bancarios</span>
        </a>
      </div>
      {children}
    </div>
  );
}
