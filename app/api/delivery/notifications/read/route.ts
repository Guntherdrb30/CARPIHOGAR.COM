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
  const id = String((body as any)?.id || "");
  const all = Boolean((body as any)?.all);

  const now = new Date();
  if (all) {
    const res = await prisma.notification.updateMany({
      where: { userId: meId, readAt: null },
      data: { readAt: now as any },
    });
    return NextResponse.json({ ok: true, updated: res.count });
  }

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id requerido o usa all:true" },
      { status: 400 },
    );
  }

  await prisma.notification.updateMany({
    where: { id, userId: meId, readAt: null },
    data: { readAt: now as any },
  });

  return NextResponse.json({ ok: true, updated: 1 });
}

