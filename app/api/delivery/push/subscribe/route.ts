import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const meId = String((session?.user as any)?.id || "");
  const role = String((session?.user as any)?.role || "");
  if (!meId || role !== "DELIVERY") {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const subscription = body as any;

  const endpoint = String(subscription?.endpoint || "");
  if (!endpoint) {
    return NextResponse.json(
      { ok: false, error: "Subscription endpoint requerido" },
      { status: 400 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Vincular el endpoint al usuario actual (upsert por endpoint)
      await tx.pushSubscription.upsert({
        where: { endpoint },
        update: {
          userId: meId,
          data: subscription as any,
        },
        create: {
          userId: meId,
          endpoint,
          data: subscription as any,
        },
      });
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error al guardar suscripción" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

