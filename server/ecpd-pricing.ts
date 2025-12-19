import { calculatePrice } from '@/app/personalizar-muebles/lib/PricingEngine';
import { ProductSchema, type ProductSchemaType } from '@/app/personalizar-muebles/lib/ProductSchema';
import { applyPriceAdjustments, type CurrencyCode, type PriceAdjustmentSettings } from '@/server/price-adjustments';

const toNumberSafe = (value: any, fallback = 0) => {
  try {
    if (value == null) return fallback;
    if (typeof value === 'number') return isFinite(value) ? value : fallback;
    if (typeof value?.toNumber === 'function') return value.toNumber();
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function buildSchema({
  productName,
  configSchema,
  adjustedReferencePrice,
  widthCm,
  depthCm,
  heightCm,
}: {
  productName: string;
  configSchema: any | null;
  adjustedReferencePrice: number;
  widthCm?: number | null;
  depthCm?: number | null;
  heightCm?: number | null;
}): ProductSchemaType {
  const baseSchema = JSON.parse(JSON.stringify(ProductSchema)) as ProductSchemaType;
  const dbSchema = configSchema && typeof configSchema === 'object' ? configSchema : null;
  const schema: ProductSchemaType = dbSchema
    ? ({ ...baseSchema, ...dbSchema, name: dbSchema.name || productName } as ProductSchemaType)
    : ({ ...baseSchema, name: productName } as ProductSchemaType);

  schema.pricing = {
    ...(schema.pricing || baseSchema.pricing),
    referencePrice: adjustedReferencePrice,
  } as any;

  const dims = schema.dimensions;
  const schemaInitial = (schema as any).initialDimensions as { width: number; depth: number; height: number } | undefined;

  let widthInitial = (widthCm || 0) > 0 ? Number(widthCm) : (schemaInitial?.width ?? dims.width.min);
  let depthInitial = (depthCm || 0) > 0 ? Number(depthCm) : (schemaInitial?.depth ?? dims.depth.min);
  let heightInitial = (heightCm || 0) > 0 ? Number(heightCm) : (schemaInitial?.height ?? dims.height.min);

  widthInitial = Math.min(Math.max(widthInitial, dims.width.min), dims.width.max);
  depthInitial = Math.min(Math.max(depthInitial, dims.depth.min), dims.depth.max);
  heightInitial = Math.min(Math.max(heightInitial, dims.height.min), dims.height.max);

  (schema as any).initialDimensions = {
    width: widthInitial,
    depth: depthInitial,
    height: heightInitial,
  };
  schema.pricing.referenceVolume = widthInitial * depthInitial * heightInitial;

  return schema;
}

export function computeConfigurablePrice({
  config,
  product,
  currency,
  settings,
}: {
  config: any;
  product: {
    name?: string | null;
    priceUSD?: any;
    categoryId?: string | null;
    configSchema?: any | null;
    widthCm?: number | null;
    depthCm?: number | null;
    heightCm?: number | null;
  };
  currency: CurrencyCode;
  settings: PriceAdjustmentSettings;
}): number {
  const base = toNumberSafe(product.priceUSD, 0);
  const adjustedReferencePrice = applyPriceAdjustments({
    basePriceUSD: base,
    currency,
    categoryId: product.categoryId || null,
    settings,
  });
  const schema = buildSchema({
    productName: String(product.name || ''),
    configSchema: product.configSchema || null,
    adjustedReferencePrice,
    widthCm: product.widthCm ?? null,
    depthCm: product.depthCm ?? null,
    heightCm: product.heightCm ?? null,
  });

  let computed = adjustedReferencePrice;
  try {
    computed = calculatePrice(config, schema);
  } catch {
    computed = adjustedReferencePrice;
  }
  if (!isFinite(computed) || computed <= 0) {
    computed = adjustedReferencePrice;
  }
  return roundMoney(computed);
}
