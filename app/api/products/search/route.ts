import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { applyPriceAdjustments, getPriceAdjustmentSettings, toCurrencyCode } from '@/server/price-adjustments';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const currency = toCurrencyCode(searchParams.get('currency') || 'USD');

  // Require admin or vendedor to use this endpoint in admin context
  const session = (await getServerSession(authOptions as any)) as any;
  const role = session?.user?.role as string | undefined;
  if (!session || (role !== 'ADMIN' && role !== 'VENDEDOR' && role !== 'ALIADO')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const digits = q.replace(/\D/g, '');
  const or: any[] = [];
  if (q) {
    or.push({ name: { contains: q, mode: 'insensitive' } });
    or.push({ sku: { contains: q, mode: 'insensitive' } });
    if (digits.length >= 6) {
      or.push({ barcode: digits });
    }
  }
  const where: any = or.length ? { OR: or } : {};
  const items = await prisma.product.findMany({
    where,
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      priceUSD: true,
      priceAllyUSD: true,
      priceWholesaleUSD: true,
      categoryId: true,
      slug: true,
      images: true,
      stock: true,
      isNew: true,
      supplier: { select: { chargeCurrency: true } },
    },
  });
  const pricing = await getPriceAdjustmentSettings();
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
  const adjusted = items.map((p) => {
    const categoryId = (p as any).categoryId || null;
    const base = toNumberSafe((p as any).priceUSD, 0);
    const baseAlly = toNumberSafe((p as any).priceAllyUSD, 0);
    const baseWholesale = toNumberSafe((p as any).priceWholesaleUSD, 0);
    const supplierCurrency = (p as any).supplier?.chargeCurrency || null;
    return {
      ...p,
      priceUSD: applyPriceAdjustments({
        basePriceUSD: base,
        currency,
        supplierCurrency,
        categoryId,
        settings: pricing,
      }),
      priceAllyUSD:
        (p as any).priceAllyUSD != null
          ? applyPriceAdjustments({
              basePriceUSD: baseAlly,
              currency,
              supplierCurrency,
              categoryId,
              settings: pricing,
            })
          : null,
      priceWholesaleUSD:
        (p as any).priceWholesaleUSD != null
          ? applyPriceAdjustments({
              basePriceUSD: baseWholesale,
              currency,
              supplierCurrency,
              categoryId,
              settings: pricing,
            })
          : null,
    };
  });
  return NextResponse.json(adjusted);
}
