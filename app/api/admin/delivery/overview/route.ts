import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (role !== "ADMIN" && role !== "DESPACHO") {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const [locations, shipments] = await Promise.all([
    prisma.driverLocation.findMany({
      include: {
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            deliveryAddress: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.shipping.findMany({
      where: {
        carrier: "DELIVERY" as any,
        status: { in: ["PENDIENTE", "DESPACHADO", "EN_TRANSITO"] as any },
      },
      include: {
        order: {
          include: {
            user: true,
            shippingAddress: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  const drivers = locations.map((loc) => ({
    driverId: loc.driverId,
    name: loc.driver.name,
    phone: loc.driver.phone,
    address: loc.driver.deliveryAddress,
    lat: Number(loc.lat),
    lng: Number(loc.lng),
    updatedAt: loc.updatedAt,
  }));

  const shipmentsOut = shipments.map((s) => ({
    id: s.id,
    orderId: s.orderId,
    status: String(s.status),
    city: s.order?.shippingAddress?.city || "",
    address: s.order?.shippingAddress?.address1 || "",
    customer: s.order?.user?.name || s.order?.user?.email || "",
    assignedToId: s.assignedToId || null,
    assignedToName: s.assignedTo?.name || null,
    updatedAt: s.updatedAt,
  }));

  return NextResponse.json({
    ok: true,
    drivers,
    shipments: shipmentsOut,
  });
}

