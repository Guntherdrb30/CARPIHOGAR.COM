'use server';

import prisma from '@/lib/prisma';

export async function getInventorySummary() {
  const [productsCount, lowStockThreshold] = await Promise.all([
    prisma.product.count(),
    prisma.siteSettings.findUnique({ where: { id: 1 }, select: { lowStockThreshold: true } }),
  ]);
  const threshold = (lowStockThreshold?.lowStockThreshold ?? 5);
  const [{ totalStock } = { totalStock: 0 }] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(SUM("stock"),0)::int AS "totalStock" FROM "public"."Product";`
  );
  const [{ totalValue } = { totalValue: 0 }] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(SUM("stock" * COALESCE("avgCost","priceUSD")),0) AS "totalValue" FROM "public"."Product";`
  );
  const lowStockCount = await prisma.product.count({ where: { stock: { lte: threshold } } });
  return { productsCount, totalUnits: Number(totalStock || 0), totalValueUSD: Number(totalValue || 0), lowStockCount, lowStockThreshold: threshold };
}

export async function getLowStockProducts(limit = 20) {
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 }, select: { lowStockThreshold: true } });
  const threshold = (settings?.lowStockThreshold ?? 5);
  const items = await prisma.product.findMany({ where: { stock: { lte: threshold } }, orderBy: { stock: 'asc' }, take: limit, select: { id: true, name: true, sku: true, stock: true } });
  return { threshold, items };
}

export async function getRecentStockMovements(take = 20) {
  const moves = await prisma.stockMovement.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: { product: { select: { id: true, name: true, sku: true } } },
  });
  return moves;
}

export async function getInventoryValuation(params?: { categorySlug?: string; supplierId?: string; q?: string }) {
  const where: any = {};
  if (params?.categorySlug) where.category = { slug: params.categorySlug };
  if (params?.supplierId) where.supplierId = params.supplierId;
  if (params?.q) where.OR = [
    { name: { contains: params.q, mode: 'insensitive' } },
    { sku: { contains: params.q, mode: 'insensitive' } },
  ];

  const products = await prisma.product.findMany({
    where,
    include: { category: true, supplier: true },
    orderBy: { name: 'asc' },
  });

  const rows = products.map((p: any) => {
    const unit = Number(p.avgCost ?? p.priceUSD ?? 0);
    const total = unit * Number(p.stock || 0);
    return { id: p.id, name: p.name, sku: p.sku || '', category: p.category?.name || '', supplier: p.supplier?.name || '', stock: Number(p.stock || 0), unitCostUSD: unit, totalValueUSD: total };
  });
  const totalValueUSD = rows.reduce((a, r) => a + r.totalValueUSD, 0);
  return { rows, totalValueUSD };
}

export async function getInventoryValuationBySupplier(params?: { categorySlug?: string; supplierId?: string; q?: string }) {
  const data = await getInventoryValuation(params);
  const groupsMap = new Map<string, { supplier: string; rows: any[]; subtotalUSD: number }>();
  for (const r of data.rows) {
    const key = r.supplier || 'Sin proveedor';
    if (!groupsMap.has(key)) groupsMap.set(key, { supplier: key, rows: [], subtotalUSD: 0 });
    const g = groupsMap.get(key)!;
    g.rows.push(r);
    g.subtotalUSD += r.totalValueUSD;
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) => a.supplier.localeCompare(b.supplier));
  const totalValueUSD = groups.reduce((a, g) => a + g.subtotalUSD, 0);
  return { groups, totalValueUSD };
}

export async function getTopSuppliersByInventory(params?: { categorySlug?: string; q?: string; limit?: number }) {
  const data = await getInventoryValuationBySupplier({ categorySlug: params?.categorySlug, q: params?.q });
  const sorted = data.groups
    .slice()
    .sort((a, b) => b.subtotalUSD - a.subtotalUSD)
    .slice(0, params?.limit ?? 5);
  const total = data.totalValueUSD;
  return { rows: sorted.map(g => ({ supplier: g.supplier, totalValueUSD: g.subtotalUSD })), totalValueUSD: total };
}

export async function getInventoryStockReport(params?: { from?: string; to?: string }) {
  const fromRaw = String(params?.from || '').trim();
  const toRaw = String(params?.to || '').trim();
  let from: Date | null = null;
  let to: Date | null = null;
  if (fromRaw) {
    const d = new Date(fromRaw);
    if (!isNaN(d.getTime())) from = d;
  }
  if (toRaw) {
    const d = new Date(toRaw);
    if (!isNaN(d.getTime())) to = d;
  }

  let productIds: string[] | null = null;
  if (from || to) {
    const movementWhere: any = {};
    if (from) movementWhere.createdAt = { gte: from };
    if (to) {
      const next = new Date(to);
      next.setDate(next.getDate() + 1);
      movementWhere.createdAt = { ...(movementWhere.createdAt || {}), lt: next };
    }
    const moves = await prisma.stockMovement.findMany({
      where: movementWhere,
      select: { productId: true },
      distinct: ['productId'],
    });
    productIds = moves.map((m) => m.productId);
    if (!productIds.length) {
      return { rows: [], totalValueUSD: 0 };
    }
  }

  const where: any = {};
  if (productIds) where.id = { in: productIds };

  const products = await prisma.product.findMany({
    where,
    include: { supplier: true },
    orderBy: { name: 'asc' },
  });

  const rows = products.map((p: any) => {
    const price = Number(p.priceUSD || 0);
    const stock = Number(p.stock || 0);
    const total = price * stock;
    return {
      id: p.id,
      code: p.sku || p.code || '',
      name: p.name || '',
      description: p.description || '',
      supplier: p.supplier?.name || '',
      stock,
      priceUSD: price,
      totalUSD: total,
    };
  });
  const totalValueUSD = rows.reduce((acc, r) => acc + r.totalUSD, 0);
  return { rows, totalValueUSD };
}

export async function getTopSoldProducts(days = 30, limit = 10, categoryId?: string) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const groups = await (prisma as any).orderItem.groupBy({
    by: ['productId'],
    _sum: { quantity: true },
    where: { order: { createdAt: { gte: since } }, ...(categoryId ? { product: { categoryId } } : {}) },
    orderBy: { _sum: { quantity: 'desc' } },
    take: limit,
  });
  const ids = groups.map((g: any) => g.productId);
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, sku: true } });
  const map = new Map(products.map((p) => [p.id, p]));
  return groups.map((g: any) => ({ product: map.get(g.productId), soldQty: Number(g._sum.quantity || 0) })).filter(x => x.product);
}

export async function getLeastSoldProducts(days = 30, limit = 10, categoryId?: string) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const groups = await (prisma as any).orderItem.groupBy({
    by: ['productId'],
    _sum: { quantity: true },
    where: { order: { createdAt: { gte: since } }, ...(categoryId ? { product: { categoryId } } : {}) },
    orderBy: { _sum: { quantity: 'asc' } },
    take: limit,
  });
  const ids = groups.map((g: any) => g.productId);
  const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, sku: true } });
  const map = new Map(products.map((p) => [p.id, p]));
  return groups.map((g: any) => ({ product: map.get(g.productId), soldQty: Number(g._sum.quantity || 0) })).filter(x => x.product);
}
