import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUserId } from "@/app/api/moodboard/_utils";

const toNumberSafe = (value: any, fallback = 0) => {
  try {
    if (value == null) return fallback;
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value?.toNumber === "function") return value.toNumber();
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};

export async function DELETE(req: Request) {
  if (req.method !== "DELETE") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Debes iniciar sesion para eliminar modulos." },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const kitchenId = String(url.searchParams.get("kitchenId") || "").trim();
    const moduleId = String(url.searchParams.get("id") || "").trim();
    if (!kitchenId || !moduleId) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "kitchenId e id son requeridos." },
        { status: 400 },
      );
    }

    const kitchen = await (prisma as any).kitchenDesign.findFirst({
      where: { id: kitchenId, userId },
      select: { id: true },
    });
    if (!kitchen) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Diseno no encontrado." },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await (tx as any).kitchenModule.deleteMany({
        where: { id: moduleId, kitchenId },
      });

      const total = await (tx as any).kitchenModule.aggregate({
        where: { kitchenId },
        _sum: { priceCalculatedUsd: true },
      });
      const totalPriceUsd = toNumberSafe(total?._sum?.priceCalculatedUsd, 0);
      await (tx as any).kitchenDesign.update({
        where: { id: kitchenId },
        data: {
          totalPriceUsd: totalPriceUsd as any,
          budgetJson: {
            subtotalModules: totalPriceUsd,
            subtotalHardware: 0,
            total: totalPriceUsd,
          },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: String(e?.message || e || "error") },
      { status: 500 },
    );
  }
}
