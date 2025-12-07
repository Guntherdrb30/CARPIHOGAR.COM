import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const meId = String((session?.user as any)?.id || "");
  const role = String((session?.user as any)?.role || "");
  if (!meId || role !== "DELIVERY") {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit") || 20), 100);

  const where: any = { userId: meId };
  if (unreadOnly) where.readAt = null;

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const rows = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data,
    readAt: n.readAt,
    createdAt: n.createdAt,
  }));

  return NextResponse.json({ ok: true, rows });
}

