import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || '');
  const meId = String((session?.user as any)?.id || '');
  if (!meId || role !== 'DELIVERY') {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const lat = Number((body as any)?.lat);
  const lng = Number((body as any)?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: false, error: 'Invalid coordinates' }, { status: 400 });
  }

  const existing = await prisma.driverLocation.findFirst({
    where: { driverId: meId },
  });

  if (existing) {
    await prisma.driverLocation.update({
      where: { id: existing.id },
      data: { lat: lat as any, lng: lng as any, updatedAt: new Date() as any },
    });
  } else {
    await prisma.driverLocation.create({
      data: { driverId: meId, lat: lat as any, lng: lng as any },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || '');
  if (role !== 'ADMIN' && role !== 'DESPACHO') {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const locations = await prisma.driverLocation.findMany({
    include: {
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
          deliveryStatus: true,
          deliveryAddress: true,
          role: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const rows = locations
    .filter((loc) => loc.driver.role === 'DELIVERY' && loc.driver.deliveryStatus === 'APPROVED')
    .map((loc) => ({
      driverId: loc.driverId,
      name: loc.driver.name,
      phone: loc.driver.phone,
      address: loc.driver.deliveryAddress,
      lat: Number(loc.lat),
      lng: Number(loc.lng),
      updatedAt: loc.updatedAt,
    }));

  return NextResponse.json({ ok: true, rows });
}

