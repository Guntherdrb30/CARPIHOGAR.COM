import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUserId } from "@/app/api/moodboard/_utils";
import { validateKitchenSpaceInput, type KitchenLayoutType } from "@/server/kitchen-space";

export async function POST(req: Request) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Debes iniciar sesion para guardar el espacio." },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const kitchenId = String(body.kitchenId || "").trim();
    if (!kitchenId) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "kitchenId requerido." },
        { status: 400 },
      );
    }

    const design = await (prisma as any).kitchenDesign.findFirst({
      where: { id: kitchenId, userId },
      select: { id: true, layoutType: true },
    });

    if (!design) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Diseno no encontrado." },
        { status: 404 },
      );
    }

    const layoutType = String(design.layoutType || "").toUpperCase() as KitchenLayoutType;
    const bodyLayout = body.layoutType ? String(body.layoutType || "").toUpperCase() : null;
    if (bodyLayout && bodyLayout !== layoutType) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "layoutType no coincide con el diseno." },
        { status: 400 },
      );
    }

    const walls = Array.isArray(body.walls) ? body.walls : [];
    const { rows, errors } = validateKitchenSpaceInput({ layoutType, walls });

    if (errors.length) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "Validacion fallida.", details: errors },
        { status: 400 },
      );
    }

    await prisma.$transaction([
      (prisma as any).kitchenSpace.deleteMany({ where: { kitchenId } }),
      rows.length
        ? (prisma as any).kitchenSpace.createMany({
            data: rows.map((row) => ({
              kitchenId,
              wallName: row.wallName,
              widthMm: row.widthMm,
              heightMm: row.heightMm,
            })),
          })
        : (prisma as any).$executeRaw`SELECT 1`,
    ]);

    return NextResponse.json({
      kitchenId,
      layoutType,
      walls: rows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: String(e?.message || e || "error") },
      { status: 500 },
    );
  }
}
