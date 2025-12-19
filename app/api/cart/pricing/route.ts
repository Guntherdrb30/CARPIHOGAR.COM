import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getPriceAdjustmentSettings, toCurrencyCode } from '@/server/price-adjustments';
import { computeConfigurablePrice } from '@/server/ecpd-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PricingItem = {
  id: string;
  config?: any;
};

export async function POST(req: Request) {
  let payload: { currency?: string; items?: PricingItem[] } | null = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const items = Array.isArray(payload?.items) ? payload!.items! : [];
  if (!items.length) {
    return NextResponse.json({ prices: {} }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const trimmed = items.slice(0, 50);
  const currency = toCurrencyCode(payload?.currency || 'USD');

  const ids = Array.from(new Set(trimmed.map((it) => String(it.id || '')).filter(Boolean)));
  if (!ids.length) {
    return NextResponse.json({ prices: {} }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      priceUSD: true,
      categoryId: true,
      configSchema: true,
      widthCm: true,
      depthCm: true,
      heightCm: true,
    },
  });
  const byId = new Map(products.map((p) => [p.id, p] as const));
  const pricing = await getPriceAdjustmentSettings();
  const prices: Record<string, number> = {};

  for (const item of trimmed) {
    const id = String(item.id || '');
    if (!id) continue;
    const product = byId.get(id);
    if (!product || !item.config) continue;
    prices[id] = computeConfigurablePrice({
      config: item.config,
      product: {
        name: (product as any).name || '',
        priceUSD: (product as any).priceUSD,
        categoryId: (product as any).categoryId || null,
        configSchema: (product as any).configSchema,
        widthCm: (product as any).widthCm ?? null,
        depthCm: (product as any).depthCm ?? null,
        heightCm: (product as any).heightCm ?? null,
      },
      currency,
      settings: pricing,
    });
  }

  return NextResponse.json(
    { prices, currency },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
