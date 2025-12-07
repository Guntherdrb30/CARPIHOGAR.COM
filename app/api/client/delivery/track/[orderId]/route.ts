import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

type TrackResponseBase = {
  shipping: {
    status: string;
    carrier: string;
    updatedAt?: Date;
  };
  destination: {
    city: string;
    address: string;
  } | null;
  driver?: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
};

export async function GET(
  _req: Request,
  context: { params: { orderId: string } },
) {
  const { orderId } = context.params;

  const session = await getServerSession(authOptions as any);
  const userId = String((session?.user as any)?.id || '');

  if (!userId) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      shipping: {
        include: {
          assignedTo: {
            select: { id: true, name: true, phone: true },
          },
        },
      } as any,
      shippingAddress: true,
    },
  });

  if (!order || !order.shipping) {
    return NextResponse.json(
      { ok: false, error: 'SHIPPING_NOT_FOUND' },
      { status: 404 },
    );
  }

  const shipping: any = order.shipping;
  const carrier = String(shipping.carrier || '');
  const status = String(shipping.status || '');

  if (carrier !== 'DELIVERY') {
    const base: TrackResponseBase = {
      shipping: { status, carrier },
      destination: order.shippingAddress
        ? {
            city: order.shippingAddress.city || '',
            address: order.shippingAddress.address1 || '',
          }
        : null,
    };
    return NextResponse.json(
      { ok: false, error: 'NOT_DELIVERY', ...base },
      { status: 200 },
    );
  }

  const destination = order.shippingAddress
    ? {
        city: order.shippingAddress.city || '',
        address: order.shippingAddress.address1 || '',
      }
    : null;

  const assignedToId = shipping.assignedToId
    ? String(shipping.assignedToId)
    : '';

  const base: TrackResponseBase = {
    shipping: {
      status,
      carrier,
      updatedAt: shipping.updatedAt as any,
    },
    destination,
    driver: shipping.assignedTo
      ? {
          id: String(shipping.assignedTo.id),
          name: shipping.assignedTo.name,
          phone: shipping.assignedTo.phone,
        }
      : null,
  };

  if (!assignedToId) {
    return NextResponse.json(
      { ok: false, error: 'NO_DRIVER_ASSIGNED', ...base },
      { status: 200 },
    );
  }

  const location = await prisma.driverLocation.findFirst({
    where: { driverId: assignedToId },
    orderBy: { updatedAt: 'desc' },
    include: {
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  });

  if (!location) {
    return NextResponse.json(
      { ok: false, error: 'NO_LOCATION_YET', ...base },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    ...base,
    position: {
      lat: Number(location.lat),
      lng: Number(location.lng),
      updatedAt: location.updatedAt,
    },
  });
}

