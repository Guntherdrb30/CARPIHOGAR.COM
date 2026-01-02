import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUserId } from "@/app/api/moodboard/_utils";

const LAYOUT_TYPES = new Set([
  "LINEAL",
  "L_SHAPE",
  "DOUBLE_LINE",
  "LINEAL_WITH_ISLAND",
  "L_WITH_ISLAND",
  "L_WITH_PENINSULA",
  "CUSTOM_SPACE",
]);

const STATUS_TYPES = new Set(["DRAFT", "SAVED", "ARCHIVED"]);
const PRICE_TIERS = new Set(["LOW", "MEDIUM", "HIGH"]);

export async function POST(req: Request) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Debes iniciar sesion para guardar el diseno." },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const name = String(body.name || "").trim();
    const layoutType = String(body.layoutType || "").trim().toUpperCase();
    const statusRaw = String(body.status || "DRAFT").trim().toUpperCase();
    const priceTierRaw = String(body.priceTier || "").trim().toUpperCase();

    if (!name) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "El nombre es obligatorio." },
        { status: 400 },
      );
    }
    if (!LAYOUT_TYPES.has(layoutType)) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "layoutType invalido." },
        { status: 400 },
      );
    }
    if (!STATUS_TYPES.has(statusRaw)) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "status invalido." },
        { status: 400 },
      );
    }

    const status = statusRaw as "DRAFT" | "SAVED" | "ARCHIVED";
    const totalPriceUsdNum = Number(body.totalPriceUsd || 0);
    const totalPriceUsd = Number.isFinite(totalPriceUsdNum) && totalPriceUsdNum > 0 ? totalPriceUsdNum : 0;
    const priceTier = PRICE_TIERS.has(priceTierRaw) ? priceTierRaw : "MEDIUM";

    const planInput = body.plan ?? body.planJson ?? null;
    const modulesJson = body.modules ?? body.modulesJson ?? null;
    const budgetInput = body.budget ?? body.budgetJson ?? null;
    const planJson =
      planInput && typeof planInput === "object" && !Array.isArray(planInput)
        ? { ...(planInput as any), priceTier }
        : { priceTier };
    const budgetJson =
      budgetInput && typeof budgetInput === "object" && !Array.isArray(budgetInput)
        ? { ...(budgetInput as any), priceTier }
        : { priceTier };

    if (status !== "ARCHIVED") {
      const activeCount = await prisma.kitchenDesign.count({
        where: { userId, status: { in: ["DRAFT", "SAVED"] } },
      });
      if (activeCount >= 5) {
        return NextResponse.json(
          {
            error: "LIMIT_REACHED",
            message:
              'Ya tienes 5 disenos activos. Archiva uno en "Mis Disenos de Cocina" antes de guardar uno nuevo.',
          },
          { status: 400 },
        );
      }
    }

    const record = await prisma.kitchenDesign.create({
      data: {
        userId,
        name,
        layoutType: layoutType as any,
        status: status as any,
        totalPriceUsd: totalPriceUsd as any,
        planJson,
        modulesJson,
        budgetJson,
      },
    });

    return NextResponse.json({
      id: record.id,
      userId: record.userId,
      name: record.name,
      layoutType: record.layoutType,
      status: record.status,
      totalPriceUsd: Number(record.totalPriceUsd as any),
      plan: record.planJson ?? null,
      modules: record.modulesJson ?? null,
      budget: record.budgetJson ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: String(e?.message || e || "error") },
      { status: 500 },
    );
  }
}
