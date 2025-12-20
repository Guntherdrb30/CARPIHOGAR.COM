import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { applyPriceAdjustments, getPriceAdjustmentSettings } from '@/server/price-adjustments';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get('supplierId') || searchParams.get('proveedor') || undefined;
  const categoria = searchParams.get('categoria') || undefined;
  const q = searchParams.get('q') || undefined;

  const where: any = {};
  if (supplierId) where.supplierId = supplierId;
  if (categoria) where.categoryId = categoria;
  if (q) where.OR = [ { name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } } ];

  const items = await prisma.product.findMany({ where, include: { category: true, supplier: true }, orderBy: { name: 'asc' } });
  const pricing = await getPriceAdjustmentSettings();

  const lines = [
    ['Proveedor','Producto','SKU','Categoría','PrecioUSD','Stock'],
    ...items.map((p) => {
    const base =
      typeof (p as any).priceUSD === 'number'
        ? (p as any).priceUSD
        : (p as any).priceUSD?.toNumber?.() ?? Number((p as any).priceUSD || 0);
    const supplierCurrency = (p as any).supplier?.chargeCurrency || null;
    const adjusted = applyPriceAdjustments({
      basePriceUSD: base,
      currency: 'USD',
      supplierCurrency,
      categoryId: (p as any).categoryId || (p as any).category?.id || null,
      settings: pricing,
    });
      return [
        p.supplier?.name || '',
        p.name,
        p.sku || '',
        (p as any).category?.name || '',
        String(adjusted),
        String(p.stock),
      ];
    })
  ];
  const csv = lines.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const filename = `productos_por_proveedor_${supplierId || 'todos'}_${Date.now()}.csv`;
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename=${filename}` } });
}
