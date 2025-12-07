import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import DeliveryDashboardClient from './DeliveryDashboardClient';

export default async function DeliveryDashboard() {
  const session = await getServerSession(authOptions);
  const meId = (session?.user as any)?.id as string;

  const availableOrders = await prisma.order.findMany({
    where: {
      shipping: {
        carrier: 'DELIVERY',
        assignedToId: null,
        status: { in: ['PENDIENTE', 'PREPARANDO', 'DESPACHADO'] },
      },
      shippingAddress: { city: { equals: 'Barinas', mode: 'insensitive' } },
    },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      shippingAddress: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const myOrders = await prisma.order.findMany({
    where: {
      shipping: {
        carrier: 'DELIVERY',
        assignedToId: meId,
        status: { in: ['PENDIENTE', 'DESPACHADO', 'EN_TRANSITO'] },
      },
      shippingAddress: { city: { equals: 'Barinas', mode: 'insensitive' } },
    },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      shippingAddress: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const available = availableOrders.map((o) => ({
    id: o.id,
    shortId: o.id.slice(0, 8),
    customer: o.user?.name || o.user?.email || '',
    phone: (o.user as any)?.phone || null,
    address: o.shippingAddress?.address1 || '',
    city: o.shippingAddress?.city || '',
    createdAt: o.createdAt.toISOString(),
  }));

  const mine = myOrders.map((o) => ({
    id: o.id,
    shortId: o.id.slice(0, 8),
    customer: o.user?.name || o.user?.email || '',
    phone: (o.user as any)?.phone || null,
    address: o.shippingAddress?.address1 || '',
    city: o.shippingAddress?.city || '',
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <div className="container mx-auto px-4 py-6">
      <DeliveryDashboardClient available={available} mine={mine} />
    </div>
  );
}

