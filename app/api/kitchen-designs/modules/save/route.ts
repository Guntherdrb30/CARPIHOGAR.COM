import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUserId } from "@/app/api/moodboard/_utils";
import { calculateKitchenModulePrice, validateModulePlacement } from "@/server/kitchen-modules";

const toInt = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
};

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

export async function POST(req: Request) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Debes iniciar sesion para guardar modulos." },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const kitchenId = String(body.kitchenId || "").trim();
    const moduleId = body.id ? String(body.id).trim() : null;
    if (!kitchenId) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "kitchenId requerido." },
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

    const positionX = toInt(body.positionX);
    const positionY = toInt(body.positionY);
    const widthMm = toInt(body.widthMm);
    const productIdInput = String(body.productId || "").trim();

    if (positionX == null || positionY == null || widthMm == null) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "Medidas y posicion requeridas." },
        { status: 400 },
      );
    }

    let existingModule: any = null;
    if (moduleId) {
      existingModule = await (prisma as any).kitchenModule.findFirst({
        where: { id: moduleId, kitchenId },
      });
      if (!existingModule) {
        return NextResponse.json(
          { error: "NOT_FOUND", message: "Modulo no encontrado." },
          { status: 404 },
        );
      }
    }

    const productId = productIdInput || existingModule?.productId;
    if (!productId) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "productId requerido." },
        { status: 400 },
      );
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        productFamily: "KITCHEN_MODULE",
        usableInKitchenDesigner: true,
      },
      select: {
        id: true,
        productFamily: true,
        basePriceUsd: true,
        parametricPricingFormula: true,
        widthMm: true,
        heightMm: true,
        depthMm: true,
        widthMinMm: true,
        widthMaxMm: true,
        heightMinMm: true,
        heightMaxMm: true,
        categoryId: true,
        supplier: { select: { chargeCurrency: true } },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "Producto no valido para el diseno." },
        { status: 400 },
      );
    }

    const existingModules = await (prisma as any).kitchenModule.findMany({
      where: { kitchenId },
      select: { id: true, kitchenId: true, productId: true, positionX: true, positionY: true, widthMm: true },
    });

    const validation = validateModulePlacement({
      draft: {
        id: moduleId || undefined,
        productId,
        positionX,
        positionY,
        widthMm,
      },
      product: {
        id: product.id,
        productFamily: String(product.productFamily || "KITCHEN_MODULE"),
        basePriceUsd: product.basePriceUsd,
        parametricPricingFormula: product.parametricPricingFormula,
        widthMm: product.widthMm ?? null,
        heightMm: product.heightMm ?? null,
        depthMm: product.depthMm ?? null,
        widthMinMm: product.widthMinMm ?? null,
        widthMaxMm: product.widthMaxMm ?? null,
        heightMinMm: product.heightMinMm ?? null,
        heightMaxMm: product.heightMaxMm ?? null,
        categoryId: product.categoryId ?? null,
        supplierCurrency: product.supplier?.chargeCurrency || null,
      },
      existing: existingModules,
    });

    if (validation.errors.length) {
      return NextResponse.json(
        { error: "INVALID_DATA", message: "Validacion fallida.", details: validation.errors },
        { status: 400 },
      );
    }

    const depthMm = toNumberSafe(product.depthMm, 0);
    const lockedHeight = validation.normalized.lockedHeight;
    const priceCalculatedUsd = await calculateKitchenModulePrice({
      product: {
        id: product.id,
        productFamily: String(product.productFamily || "KITCHEN_MODULE"),
        basePriceUsd: product.basePriceUsd,
        parametricPricingFormula: product.parametricPricingFormula,
        widthMm: product.widthMm ?? null,
        heightMm: product.heightMm ?? null,
        depthMm: product.depthMm ?? null,
        widthMinMm: product.widthMinMm ?? null,
        widthMaxMm: product.widthMaxMm ?? null,
        heightMinMm: product.heightMinMm ?? null,
        heightMaxMm: product.heightMaxMm ?? null,
        categoryId: product.categoryId ?? null,
        supplierCurrency: product.supplier?.chargeCurrency || null,
      },
      widthMm: validation.normalized.widthMm,
    });

    const saved = await prisma.$transaction(async (tx) => {
      let record: any;
      if (existingModule) {
        record = await (tx as any).kitchenModule.update({
          where: { id: existingModule.id },
          data: {
            productId: product.id,
            positionX: validation.normalized.positionX,
            positionY: validation.normalized.positionY,
            widthMm: validation.normalized.widthMm,
            depthMm: Math.round(depthMm),
            lockedHeight,
            priceCalculatedUsd: priceCalculatedUsd as any,
          },
        });
      } else {
        record = await (tx as any).kitchenModule.create({
          data: {
            kitchenId,
            productId: product.id,
            positionX: validation.normalized.positionX,
            positionY: validation.normalized.positionY,
            widthMm: validation.normalized.widthMm,
            depthMm: Math.round(depthMm),
            lockedHeight,
            priceCalculatedUsd: priceCalculatedUsd as any,
          },
        });
      }

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

      return { record, totalPriceUsd };
    });

    return NextResponse.json({
      id: saved.record.id,
      kitchenId,
      productId: saved.record.productId,
      positionX: saved.record.positionX,
      positionY: saved.record.positionY,
      widthMm: saved.record.widthMm,
      depthMm: saved.record.depthMm,
      lockedHeight: saved.record.lockedHeight,
      priceCalculatedUsd: Number(saved.record.priceCalculatedUsd as any),
      totalPriceUsd: saved.totalPriceUsd,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: String(e?.message || e || "error") },
      { status: 500 },
    );
  }
}
