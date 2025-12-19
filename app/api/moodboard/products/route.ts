import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { applyPriceAdjustments, getPriceAdjustmentSettings } from '@/server/price-adjustments';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const category = (url.searchParams.get('category') || '').trim();
    const minPrice = url.searchParams.get('minPrice');
    const maxPrice = url.searchParams.get('maxPrice');

    const where: any = { status: 'ACTIVE' as any };

    const or: any[] = [];
    if (q) {
      or.push({ name: { contains: q, mode: 'insensitive' } });
      or.push({ sku: { contains: q, mode: 'insensitive' } as any });
      or.push({ code: { contains: q, mode: 'insensitive' } as any });
      or.push({ keywords: { has: q } as any });
    }
    if (or.length) {
      where.OR = or;
    }

    if (category) {
      where.category = {
        OR: [
          { slug: { equals: category, mode: 'insensitive' } },
          { name: { contains: category, mode: 'insensitive' } },
        ],
      } as any;
    }

    const minPriceNum = minPrice ? parseFloat(minPrice) : NaN;
    const maxPriceNum = maxPrice ? parseFloat(maxPrice) : NaN;

    const products = await prisma.product.findMany({
      where,
      take: 80,
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });
    const pricing = await getPriceAdjustmentSettings();

    const items = products.map((p) => {
      const primaryImage = (p.images || [])[0] || '';
      const categoryId = (p as any).categoryId || p.category?.id || null;
      const basePrice = typeof (p as any).priceUSD === 'number'
        ? (p as any).priceUSD
        : (p as any).priceUSD?.toNumber?.() ?? Number((p as any).priceUSD || 0);
      const adjusted = applyPriceAdjustments({
        basePriceUSD: basePrice,
        currency: 'USD',
        categoryId,
        settings: pricing,
      });
      return {
        id: p.id,
        name: p.name,
        code: p.code || p.sku || '',
        price: adjusted,
        imageUrl: primaryImage,
        category: p.category?.name || undefined,
      };
    });
    const filtered = items.filter((item) => {
      if (isFinite(minPriceNum) && item.price < minPriceNum) return false;
      if (isFinite(maxPriceNum) && item.price > maxPriceNum) return false;
      return true;
    });

    return NextResponse.json(filtered.slice(0, 40));
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e || 'error') },
      { status: 500 },
    );
  }
}
