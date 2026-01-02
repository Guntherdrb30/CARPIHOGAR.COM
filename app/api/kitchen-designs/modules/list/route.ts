import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUserId } from "@/app/api/moodboard/_utils";

export async function GET(req: Request) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json([]);
    }

    const url = new URL(req.url);
    const kitchenId = String(url.searchParams.get("kitchenId") || "").trim();
    if (!kitchenId) {
      return NextResponse.json({ error: "kitchenId requerido." }, { status: 400 });
    }

    const design = await (prisma as any).kitchenDesign.findFirst({
      where: { id: kitchenId, userId },
      select: { id: true, totalPriceUsd: true },
    });

    if (!design) {
      return NextResponse.json({ error: "Diseno no encontrado." }, { status: 404 });
    }

    const modules = await (prisma as any).kitchenModule.findMany({
      where: { kitchenId },
      orderBy: { createdAt: "asc" },
    });

    const mapped = modules.map((m: any) => ({
      id: m.id,
      kitchenId: m.kitchenId,
      productId: m.productId,
      positionX: m.positionX,
      positionY: m.positionY,
      widthMm: m.widthMm,
      depthMm: m.depthMm,
      lockedHeight: m.lockedHeight,
      priceCalculatedUsd: Number(m.priceCalculatedUsd as any),
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      kitchenId,
      totalPriceUsd: Number(design.totalPriceUsd as any),
      modules: mapped,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: String(e?.message || e || "error") },
      { status: 500 },
    );
  }
}
