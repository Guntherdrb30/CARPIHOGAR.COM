import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { applyPriceAdjustments, getPriceAdjustmentSettings, toCurrencyCode } from '@/server/price-adjustments';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = (searchParams.get('ids') || '').trim();
    const includePrices = String(searchParams.get('includePrices') || '') === '1';
    const currency = toCurrencyCode(searchParams.get('currency') || 'USD');
    if (!idsParam) {
      return NextResponse.json({ stocks: {} }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ stocks: {} }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const rows = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, stock: true, stockUnits: true, priceUSD: true, categoryId: true },
    });
    const map: Record<string, number> = {};
    const priceMap: Record<string, number> = {};
    const pricing = includePrices ? await getPriceAdjustmentSettings() : null;
    for (const r of rows) {
      const units = typeof (r as any).stockUnits === 'number' && (r as any).stockUnits != null
        ? Number((r as any).stockUnits)
        : Number(r.stock || 0);
      map[r.id] = units;
      if (includePrices && pricing) {
        const base =
          typeof (r as any).priceUSD === 'number'
            ? (r as any).priceUSD
            : (r as any).priceUSD?.toNumber?.() ?? Number((r as any).priceUSD || 0);
        priceMap[r.id] = applyPriceAdjustments({
          basePriceUSD: base,
          currency,
          categoryId: (r as any).categoryId || null,
          settings: pricing,
        });
      }
    }
    // Include ids not found as 0 to avoid undefined client-side
    for (const id of ids) if (!(id in map)) map[id] = 0;
    if (includePrices) {
      for (const id of ids) if (!(id in priceMap)) priceMap[id] = 0;
      return NextResponse.json(
        { stocks: map, prices: priceMap, currency },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json({ stocks: map }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    const err = String(e?.message || e || 'unknown');
    console.error('[api/stock] error', err);
    return NextResponse.json({ error: 'stock_error' }, { status: 500 });
  }
}
