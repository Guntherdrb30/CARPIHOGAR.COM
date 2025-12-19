import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { applyPriceAdjustments, getPriceAdjustmentSettings } from '@/server/price-adjustments';

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const pricing = await getPriceAdjustmentSettings();

    const headers = [
      'name','code','sku','barcode','brand','description','category','supplierId','stock','costUSD','priceUSD','priceAllyUSD','priceWholesaleUSD','images'
    ];
    const rows: string[] = [];
    rows.push(headers.join(','));
    for (const p of products) {
      const basePrice = (p.priceUSD as any)?.toNumber?.() ?? Number(p.priceUSD || 0);
      const baseAlly = (p.priceAllyUSD as any)?.toNumber?.() ?? Number(p.priceAllyUSD || 0);
      const baseWholesale = (p.priceWholesaleUSD as any)?.toNumber?.() ?? Number(p.priceWholesaleUSD || 0);
      const categoryId = (p as any).categoryId || p.category?.id || null;
      const adjustedPrice = applyPriceAdjustments({
        basePriceUSD: basePrice,
        currency: 'USD',
        categoryId,
        settings: pricing,
      });
      const adjustedAlly = (p.priceAllyUSD != null)
        ? applyPriceAdjustments({
            basePriceUSD: baseAlly,
            currency: 'USD',
            categoryId,
            settings: pricing,
          })
        : null;
      const adjustedWholesale = (p.priceWholesaleUSD != null)
        ? applyPriceAdjustments({
            basePriceUSD: baseWholesale,
            currency: 'USD',
            categoryId,
            settings: pricing,
          })
        : null;

      const vals = [
        p.name,
        p.code || '',
        p.sku || '',
        p.barcode || '',
        p.brand || '',
        p.description || '',
        p.category?.slug || '',
        p.supplierId || '',
        String(p.stock ?? 0),
        (p.costUSD as any)?.toString?.() || '',
        String(adjustedPrice),
        adjustedAlly != null ? String(adjustedAlly) : '',
        adjustedWholesale != null ? String(adjustedWholesale) : '',
        (Array.isArray(p.images) ? p.images.join('|') : ''),
      ].map((v) => {
        const s = String(v ?? '');
        return /[,\n\r"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      });
      rows.push(vals.join(','));
    }
    const csv = rows.join('\r\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="products_export.csv"',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
