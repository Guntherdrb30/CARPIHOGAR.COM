import prisma from '@/lib/prisma';
import { ensureSiteSettingsColumns } from '@/server/actions/settings';

export type CurrencyCode = 'USD' | 'VES';

export type PriceAdjustmentSettings = {
  globalPriceAdjustmentPercent: number;
  globalPriceAdjustmentEnabled: boolean;
  priceAdjustmentUSDPercent: number;
  priceAdjustmentVESPercent: number;
  priceAdjustmentByCurrencyEnabled: boolean;
  categoryPriceAdjustments: Record<string, number>;
  usdPaymentDiscountPercent: number;
  usdPaymentDiscountEnabled: boolean;
};

const DEFAULT_SETTINGS: PriceAdjustmentSettings = {
  globalPriceAdjustmentPercent: 0,
  globalPriceAdjustmentEnabled: false,
  priceAdjustmentUSDPercent: 0,
  priceAdjustmentVESPercent: 0,
  priceAdjustmentByCurrencyEnabled: false,
  categoryPriceAdjustments: {},
  usdPaymentDiscountPercent: 20,
  usdPaymentDiscountEnabled: true,
};

const toNumber = (value: any, fallback = 0): number => {
  try {
    if (value == null) return fallback;
    if (typeof value === 'number') return isFinite(value) ? value : fallback;
    if (typeof value?.toNumber === 'function') {
      const n = value.toNumber();
      return isFinite(n) ? n : fallback;
    }
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};

const toBool = (value: any, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
    if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  }
  return fallback;
};

const normalizeCategoryAdjustments = (value: any): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = toNumber(raw, 0);
    if (!isFinite(n)) continue;
    out[key] = n;
  }
  return out;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export async function getPriceAdjustmentSettings(): Promise<PriceAdjustmentSettings> {
  await ensureSiteSettingsColumns();
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: 1 },
      select: {
        globalPriceAdjustmentPercent: true,
        globalPriceAdjustmentEnabled: true,
        priceAdjustmentUSDPercent: true,
        priceAdjustmentVESPercent: true,
        priceAdjustmentByCurrencyEnabled: true,
        categoryPriceAdjustments: true,
        usdPaymentDiscountPercent: true,
        usdPaymentDiscountEnabled: true,
      },
    });
    if (!settings) return { ...DEFAULT_SETTINGS };
    return {
      globalPriceAdjustmentPercent: toNumber(
        (settings as any).globalPriceAdjustmentPercent,
        DEFAULT_SETTINGS.globalPriceAdjustmentPercent,
      ),
      globalPriceAdjustmentEnabled: toBool(
        (settings as any).globalPriceAdjustmentEnabled,
        DEFAULT_SETTINGS.globalPriceAdjustmentEnabled,
      ),
      priceAdjustmentUSDPercent: toNumber(
        (settings as any).priceAdjustmentUSDPercent,
        DEFAULT_SETTINGS.priceAdjustmentUSDPercent,
      ),
      priceAdjustmentVESPercent: toNumber(
        (settings as any).priceAdjustmentVESPercent,
        DEFAULT_SETTINGS.priceAdjustmentVESPercent,
      ),
      priceAdjustmentByCurrencyEnabled: toBool(
        (settings as any).priceAdjustmentByCurrencyEnabled,
        DEFAULT_SETTINGS.priceAdjustmentByCurrencyEnabled,
      ),
      categoryPriceAdjustments: normalizeCategoryAdjustments(
        (settings as any).categoryPriceAdjustments,
      ),
      usdPaymentDiscountPercent: toNumber(
        (settings as any).usdPaymentDiscountPercent,
        DEFAULT_SETTINGS.usdPaymentDiscountPercent,
      ),
      usdPaymentDiscountEnabled: toBool(
        (settings as any).usdPaymentDiscountEnabled,
        DEFAULT_SETTINGS.usdPaymentDiscountEnabled,
      ),
    };
  } catch (err) {
    console.warn('[getPriceAdjustmentSettings] fallback to defaults', err);
    return { ...DEFAULT_SETTINGS };
  }
}

export function applyPriceAdjustments({
  basePriceUSD,
  currency = 'USD',
  categoryId,
  settings,
}: {
  basePriceUSD: number;
  currency?: CurrencyCode;
  categoryId?: string | null;
  settings: PriceAdjustmentSettings;
}): number {
  let price = Number(basePriceUSD || 0);
  if (!isFinite(price) || price <= 0) return 0;

  if (settings.globalPriceAdjustmentEnabled && settings.globalPriceAdjustmentPercent) {
    price *= 1 + settings.globalPriceAdjustmentPercent / 100;
  }

  if (settings.priceAdjustmentByCurrencyEnabled) {
    const pct =
      currency === 'VES'
        ? settings.priceAdjustmentVESPercent
        : settings.priceAdjustmentUSDPercent;
    if (pct) price *= 1 + pct / 100;
  }

  if (categoryId && settings.categoryPriceAdjustments[categoryId]) {
    const pct = settings.categoryPriceAdjustments[categoryId];
    if (pct) price *= 1 + pct / 100;
  }

  return roundMoney(price);
}

export function applyUsdPaymentDiscount({
  subtotalUSD,
  currency,
  settings,
}: {
  subtotalUSD: number;
  currency: CurrencyCode | string;
  settings: PriceAdjustmentSettings;
}) {
  const normCurrency = String(currency || 'USD').toUpperCase();
  const isUsd = normCurrency === 'USD' || normCurrency === 'USDT';
  const enabled = settings.usdPaymentDiscountEnabled && isUsd;
  const pct = enabled ? settings.usdPaymentDiscountPercent : 0;
  const discountUSD = pct ? subtotalUSD * (pct / 100) : 0;
  const subtotalAfterDiscount = subtotalUSD - discountUSD;
  return {
    discountPercent: pct,
    discountUSD: roundMoney(discountUSD),
    subtotalAfterDiscount: roundMoney(subtotalAfterDiscount),
  };
}

export function toCurrencyCode(input: any): CurrencyCode {
  const v = String(input || 'USD').toUpperCase();
  return v === 'VES' ? 'VES' : 'USD';
}
