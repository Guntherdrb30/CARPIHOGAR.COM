import { computeParametricKitchenDesignerPrice } from "@/server/parametric-pricing";
import { getPriceAdjustmentSettings, type CurrencyCode } from "@/server/price-adjustments";

type ProductInput = {
  id: string;
  productFamily?: string | null;
  basePriceUsd?: any;
  priceUSD?: any;
  kitchenPriceLowUsd?: any;
  kitchenPriceMidUsd?: any;
  kitchenPriceHighUsd?: any;
  parametricPricingFormula?: string | null;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  widthMinMm?: number | null;
  widthMaxMm?: number | null;
  heightMinMm?: number | null;
  heightMaxMm?: number | null;
  categoryId?: string | null;
  supplierCurrency?: string | null;
};

export type KitchenPriceTier = "LOW" | "MEDIUM" | "HIGH";

export type KitchenModuleDraft = {
  id?: string;
  productId: string;
  positionX: number;
  positionY: number;
  widthMm: number;
};

export type StoredKitchenModule = {
  id: string;
  kitchenId: string;
  productId: string;
  positionX: number;
  positionY: number;
  widthMm: number;
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

const overlaps1d = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && aEnd > bStart;

const normalizeTier = (value?: string | null): KitchenPriceTier => {
  const tier = String(value || "").toUpperCase();
  if (tier === "LOW" || tier === "MEDIUM" || tier === "HIGH") return tier;
  return "MEDIUM";
};

const resolveKitchenTierPrice = (product: ProductInput, tier?: KitchenPriceTier | string | null) => {
  const normalized = normalizeTier(tier);
  const low = toNumberSafe(product.kitchenPriceLowUsd, 0);
  const mid = toNumberSafe(product.kitchenPriceMidUsd, 0);
  const high = toNumberSafe(product.kitchenPriceHighUsd, 0);
  if (normalized === "LOW" && low > 0) return low;
  if (normalized === "MEDIUM" && mid > 0) return mid;
  if (normalized === "HIGH" && high > 0) return high;
  const base = toNumberSafe(product.basePriceUsd, 0);
  if (base > 0) return base;
  const fallback = toNumberSafe(product.priceUSD, 0);
  if (fallback > 0) return fallback;
  return 0;
};

export function validateModulePlacement(args: {
  draft: KitchenModuleDraft;
  product: ProductInput;
  existing: StoredKitchenModule[];
}) {
  const { draft, product, existing } = args;
  const errors: string[] = [];

  const widthMm = Math.round(Number(draft.widthMm));
  const positionX = Math.round(Number(draft.positionX));
  const positionY = Math.round(Number(draft.positionY));

  if (!Number.isFinite(widthMm) || widthMm <= 0) {
    errors.push("widthMm invalido.");
  }
  if (!Number.isFinite(positionX) || positionX < 0) {
    errors.push("positionX invalido.");
  }
  if (!Number.isFinite(positionY) || positionY < 0) {
    errors.push("positionY invalido.");
  }

  const widthMin = product.widthMinMm != null ? Number(product.widthMinMm) : null;
  const widthMax = product.widthMaxMm != null ? Number(product.widthMaxMm) : null;
  if (widthMin == null || widthMax == null) {
    errors.push("Rango de ancho no definido para el modulo.");
  } else if (widthMm < widthMin || widthMm > widthMax) {
    errors.push(`widthMm fuera de rango (${widthMin}-${widthMax}).`);
  }

  const height = toNumberSafe(product.heightMm, 0);
  if (!height || height <= 0) {
    errors.push("Altura fija no definida en el producto.");
  }

  const filtered = existing.filter((m) => m.id !== draft.id);
  for (const other of filtered) {
    if (Number(other.positionY) !== positionY) continue;
    const otherStart = Number(other.positionX);
    const otherEnd = otherStart + Number(other.widthMm || 0);
    const nextEnd = positionX + widthMm;
    if (overlaps1d(positionX, nextEnd, otherStart, otherEnd)) {
      errors.push("Solapado basico detectado en la misma pared.");
      break;
    }
  }

  return {
    errors,
    normalized: {
      widthMm,
      positionX,
      positionY,
      lockedHeight: Math.round(height),
    },
  };
}

export async function calculateKitchenModulePrice(args: {
  product: ProductInput;
  widthMm: number;
  currency?: CurrencyCode;
  priceTier?: KitchenPriceTier | string | null;
}) {
  const { product, widthMm, currency = "USD", priceTier } = args;
  const settings = await getPriceAdjustmentSettings();
  const tierPrice = resolveKitchenTierPrice(product, priceTier);
  return computeParametricKitchenDesignerPrice({
    product: {
      basePriceUsd: tierPrice || product.basePriceUsd,
      priceUSD: tierPrice || product.basePriceUsd || product.priceUSD,
      parametricPricingFormula: product.parametricPricingFormula,
      widthMm: product.widthMm,
      heightMm: product.heightMm,
      depthMm: product.depthMm,
      widthMinMm: product.widthMinMm,
      widthMaxMm: product.widthMaxMm,
      heightMinMm: product.heightMinMm,
      heightMaxMm: product.heightMaxMm,
      categoryId: product.categoryId || null,
      productFamily: product.productFamily || "KITCHEN_MODULE",
    },
    dimensions: {
      widthMm,
      heightMm: product.heightMm ?? null,
      depthMm: product.depthMm ?? null,
    },
    currency,
    supplierCurrency: product.supplierCurrency || null,
    settings,
  });
}
