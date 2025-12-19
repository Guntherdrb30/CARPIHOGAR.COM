import prisma from '@/lib/prisma';
import { emit } from '@/server/events/bus';
import { applyPriceAdjustments, applyUsdPaymentDiscount, getPriceAdjustmentSettings } from '@/server/price-adjustments';

export async function verifyToken(customerId: string, token: string) {
  const rec = await prisma.purchaseToken.findFirst({ where: { customerId, token, used: false } });
  if (!rec) return { ok: false };
  if (rec.expiresAt && rec.expiresAt < (new Date() as any)) return { ok: false };
  await prisma.purchaseToken.update({ where: { id: rec.id }, data: { used: true } });
  // Create order from temp
  const temp = await prisma.ordersTemp.findUnique({ where: { id: rec.orderTempId } });
  if (!temp) return { ok: false };
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const ivaPercent = Number(settings?.ivaPercent || 16);
  const tasaVES = Number(settings?.tasaVES || 40);
  const items: Array<{ productId: string; name: string; priceUSD: number; quantity: number }> = Array.isArray((temp as any).items) ? (temp as any).items : [];
  const pricing = await getPriceAdjustmentSettings();
  const ids = Array.from(new Set(items.map((it) => it.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, priceUSD: true, categoryId: true },
  });
  const byId = new Map(products.map((p) => [p.id, p] as const));
  const pricedItems = items.map((it) => {
    const p = byId.get(it.productId);
    const base =
      p && (p as any).priceUSD != null
        ? ((p as any).priceUSD?.toNumber?.() ?? Number((p as any).priceUSD || 0))
        : Number(it.priceUSD || 0);
    const priceUSD = p
      ? applyPriceAdjustments({
          basePriceUSD: base,
          currency: 'USD',
          categoryId: (p as any).categoryId || null,
          settings: pricing,
        })
      : Number(it.priceUSD || 0);
    return { ...it, priceUSD };
  });
  const subtotalUSD = pricedItems.reduce((s, it) => s + (Number(it.priceUSD) * Number(it.quantity)), 0);
  const discount = applyUsdPaymentDiscount({ subtotalUSD, currency: 'USD', settings: pricing });
  const totalUSD = discount.subtotalAfterDiscount * (1 + ivaPercent/100);
  const totalVES = totalUSD * tasaVES;
  const order = await prisma.order.create({ data: {
    userId: temp.customerId,
    subtotalUSD: subtotalUSD as any,
    ivaPercent: ivaPercent as any,
    tasaVES: tasaVES as any,
    totalUSD: totalUSD as any,
    totalVES: totalVES as any,
    status: 'PENDIENTE' as any,
    saleType: 'CONTADO' as any,
    items: { create: pricedItems.map((it) => ({ productId: it.productId, name: it.name || '', priceUSD: it.priceUSD as any, quantity: it.quantity })) },
  }, include: { items: true } });
  try { await emit('order.confirmed' as any, { orderId: order.id, customerId }); } catch {}
  return { ok: true, orderId: order.id };
}
