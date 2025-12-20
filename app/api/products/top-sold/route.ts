import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTopSoldProducts } from '@/server/actions/inventory';
import { getSettings } from '@/server/actions/settings';
import { applyPriceAdjustments, getPriceAdjustmentSettings } from '@/server/price-adjustments';

function toNum(x: any, fb: number | null = null) {
  try {
    if (x == null) return fb as any;
    if (typeof x === 'number') return x;
    if (typeof (x as any)?.toNumber === 'function') return (x as any).toNumber();
    const n = Number(x);
    return isNaN(n) ? (fb as any) : n;
  } catch { return fb as any; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get('days') || 30);
  const limit = Number(searchParams.get('limit') || 5);
  const top = await getTopSoldProducts(days, limit);
  const ids = top.map((t: any) => t.product?.id).filter(Boolean);
  if (!ids.length) return NextResponse.json({ items: [], tasaVES: (await getSettings()).tasaVES });

  const rows = await prisma.product.findMany({
    where: { id: { in: ids as string[] } },
    include: { category: { select: { name: true } }, supplier: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const settings = await getSettings();
  const pricing = await getPriceAdjustmentSettings();
  const items = ids
    .map((id: string) => byId.get(id))
    .filter(Boolean)
    .map((p: any) => {
      const categoryId = p.categoryId || p.category?.id || null;
      const base = toNum(p.priceUSD, 0);
      const supplierCurrency = (p as any).supplier?.chargeCurrency || null;
      return {
        ...p,
        images: Array.isArray(p.images) ? p.images : [],
        priceUSD: applyPriceAdjustments({
          basePriceUSD: base,
          currency: 'USD',
          supplierCurrency,
          categoryId,
          settings: pricing,
        }),
      };
    });
  return NextResponse.json({ items, tasaVES: (settings as any).tasaVES });
}
