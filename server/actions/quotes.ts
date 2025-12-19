'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { applyPriceAdjustments, getPriceAdjustmentSettings, type PriceAdjustmentSettings } from '@/server/price-adjustments';

async function autoExpireQuotes() {
  try {
    await prisma.quote.updateMany({
      where: {
        expiresAt: { lt: new Date() },
        status: { notIn: ['APROBADO','RECHAZADO','VENCIDO'] as any },
      },
      data: { status: 'VENCIDO' as any },
    });
  } catch {}
}

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

async function buildAdjustedQuoteItems(
  items: Array<{ productId: string; name: string; priceUSD: number; quantity: number }>,
  pricing: PriceAdjustmentSettings,
) {
  const ids = Array.from(new Set(items.map((it) => it.productId))).filter(Boolean);
  if (!ids.length) {
    return items.map((it) => ({ ...it, priceUSD: Number(it.priceUSD || 0) }));
  }

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, priceUSD: true, priceAllyUSD: true, categoryId: true },
  });
  const byId = new Map(products.map((p) => [p.id, p] as const));

  return items.map((it) => {
    const p = byId.get(it.productId);
    if (!p) {
      return { ...it, priceUSD: Number(it.priceUSD || 0) };
    }
    const categoryId = (p as any).categoryId || null;
    const baseP1 = toNumberSafe((p as any).priceUSD, 0);
    const baseP2 = (p as any).priceAllyUSD != null ? toNumberSafe((p as any).priceAllyUSD, 0) : null;
    const adjustedP1 = applyPriceAdjustments({
      basePriceUSD: baseP1,
      currency: 'USD',
      categoryId,
      settings: pricing,
    });
    const adjustedP2 =
      baseP2 != null
        ? applyPriceAdjustments({
            basePriceUSD: baseP2,
            currency: 'USD',
            categoryId,
            settings: pricing,
          })
        : null;
    const requested = Number(it.priceUSD || 0);
    let priceUSD = adjustedP1;
    if (adjustedP2 != null) {
      const diffP1 = Math.abs(requested - adjustedP1);
      const diffP2 = Math.abs(requested - adjustedP2);
      priceUSD = diffP2 <= diffP1 ? adjustedP2 : adjustedP1;
    }
    if (!priceUSD && requested) priceUSD = requested;
    return { ...it, name: it.name || (p as any).name || '', priceUSD };
  });
}

export async function getQuotes(filters?: { q?: string; status?: 'BORRADOR'|'ENVIADO'|'APROBADO'|'RECHAZADO'|'VENCIDO'|string; sellerId?: string; from?: string; to?: string }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  await autoExpireQuotes();
  const where: any = {};
  if (filters?.status) {
    const st = String(filters.status).toUpperCase();
    if (['BORRADOR','ENVIADO','APROBADO','RECHAZADO','VENCIDO'].includes(st)) where.status = st as any;
  }
  if (filters?.sellerId) where.sellerId = String(filters.sellerId);
  if (filters?.from || filters?.to) {
    const createdAt: any = {};
    if (filters.from) { const d = new Date(String(filters.from)); if (!isNaN(d.getTime())) createdAt.gte = d as any; }
    if (filters.to) { const d = new Date(String(filters.to)); if (!isNaN(d.getTime())) { const next = new Date(d); next.setDate(next.getDate()+1); createdAt.lt = next as any; } }
    if (Object.keys(createdAt).length) where.createdAt = createdAt;
  }
  if (filters?.q) {
    const q = String(filters.q);
    where.OR = [
      { id: { contains: q } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
    ];
  }
  const quotes = await prisma.quote.findMany({ where, include: { user: true, seller: true, items: true }, orderBy: { createdAt: 'desc' } });
  return quotes;
}

export async function getQuoteById(id: string) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  await autoExpireQuotes();
  return prisma.quote.findUnique({ where: { id }, include: { user: true, seller: true, items: { include: { product: true } } } });
}

export async function createQuote(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN' && (session?.user as any)?.role !== 'VENDEDOR' && (session?.user as any)?.role !== 'ALIADO') {
    throw new Error('Not authorized');
  }
  const role = String((session?.user as any)?.role || '');
  const emailVerified = (session?.user as any)?.emailVerified === true;
  if (role === 'ALIADO' && !emailVerified) {
    redirect('/auth/verify-required');
  }
  const userEmail = String(formData.get('customerEmail') || '');
  const userName = String(formData.get('customerName') || '');
  const userPhone = String(formData.get('customerPhone') || '');
  let sellerId = String(formData.get('sellerId') || '');
  const itemsJson = String(formData.get('items') || '[]');
  const items: Array<{ productId: string; name: string; priceUSD: number; quantity: number } > = JSON.parse(itemsJson || '[]');
  const ivaPercentForm = formData.get('ivaPercent');
  const customerTaxId = (String(formData.get('customerTaxId') || '').trim() || null);
  const customerFiscalAddress = (String(formData.get('customerFiscalAddress') || '').trim() || null);
  const notes = String(formData.get('notes') || '');

  if (!items.length) {
    if (role === 'ALIADO') {
      redirect('/dashboard/aliado/presupuestos/nuevo?error=' + encodeURIComponent('Debes agregar al menos un producto'));
    }
    redirect('/dashboard/admin/presupuestos/nuevo?error=' + encodeURIComponent('Debes agregar al menos un producto'));
  }
  if (!userPhone.trim()) {
    if (role === 'ALIADO') {
      redirect('/dashboard/aliado/presupuestos/nuevo?error=' + encodeURIComponent('El teléfono del cliente es obligatorio'));
    }
    redirect('/dashboard/admin/presupuestos/nuevo?error=' + encodeURIComponent('El teléfono del cliente es obligatorio'));
  }

  // Ensure customer exists or create a placeholder
  let user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    user = await prisma.user.create({ data: { email: userEmail || `walkin_${Date.now()}@local`, password: '', name: userName || 'Cliente Presupuesto', role: 'CLIENTE', alliedStatus: 'NONE' } });
  }
  // Update phone if provided
  try {
    if (userPhone && user.phone !== userPhone) {
      await prisma.user.update({ where: { id: user.id }, data: { phone: userPhone } });
    }
  } catch {}

  // Optionally save shipping address to user's address book
  try {
    const shippingAddressId = String(formData.get('shippingAddressId') || '');
    if (shippingAddressId) {
      const addr = await prisma.address.findFirst({ where: { id: shippingAddressId, userId: user.id } });
      // If found, nothing else to do
    } else {
      const addrState = String(formData.get('addr_state') || '').trim();
      const addrCity = String(formData.get('addr_city') || '').trim();
      const addr1 = String(formData.get('addr_address1') || '').trim();
      if (addrState && addrCity && addr1) {
        const addrZone = String(formData.get('addr_zone') || '').trim() || null;
        const addr2 = String(formData.get('addr_address2') || '').trim() || null;
        const addrNotes = String(formData.get('addr_notes') || '').trim() || null;
        await prisma.address.create({ data: { userId: user.id, fullname: user.name || userEmail || 'Cliente', phone: userPhone || (user.phone || ''), state: addrState, city: addrCity, zone: addrZone as any, address1: addr1, address2: addr2 as any, notes: addrNotes as any } });
      }
    }
  } catch {}

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const ivaPercent = ivaPercentForm !== null ? Number(ivaPercentForm) : Number(settings?.ivaPercent || 16);
  const tasaVES = Number(settings?.tasaVES || 40);

  const pricing = await getPriceAdjustmentSettings();
  const pricedItems = await buildAdjustedQuoteItems(items, pricing);
  const subtotalUSD = pricedItems.reduce((acc, it) => acc + (Number(it.priceUSD) * Number(it.quantity)), 0);
  const totalUSD = subtotalUSD * (1 + ivaPercent/100);
  const totalVES = totalUSD * tasaVES;

  // For ALIADO role, force sellerId to be the current user
  if (role === 'ALIADO') {
    sellerId = String((session?.user as any)?.id || '') || null as any;
  }

  const quote = await prisma.quote.create({
    data: {
      userId: user.id,
      sellerId: sellerId || null,
      subtotalUSD,
      ivaPercent,
      tasaVES,
      totalUSD,
      totalVES,
      status: 'BORRADOR' as any,
      notes: notes || null,
      customerTaxId: customerTaxId as any,
      customerFiscalAddress: customerFiscalAddress as any,
      items: { create: pricedItems.map(it => ({ productId: it.productId, name: it.name, priceUSD: it.priceUSD as any, quantity: it.quantity })) },
    },
  });

  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'QUOTE_CREATE', details: quote.id } }); } catch {}
  // Send email to customer (best-effort)
  try {
    if (process.env.EMAIL_ENABLED === 'true') {
      const { sendQuoteCreatedEmail } = await import('./email');
      await sendQuoteCreatedEmail(quote.id);
    }
  } catch {}
  // Ensure both dashboards reflect the new quote
  try { revalidatePath('/dashboard/admin/presupuestos'); } catch {}
  try { revalidatePath('/dashboard/aliado/presupuestos'); } catch {}
  if (role === 'ALIADO') {
    redirect(`/dashboard/aliado/presupuestos?message=${encodeURIComponent('Presupuesto creado')}`);
  }
  redirect(`/dashboard/admin/presupuestos/${quote.id}?message=${encodeURIComponent('Presupuesto creado')}`);
}

// Ally-only: list own quotes
export async function getMyAllyQuotes(filters?: { q?: string; status?: 'BORRADOR'|'ENVIADO'|'APROBADO'|'RECHAZADO'|'VENCIDO'|string; from?: string; to?: string }) {
  const session = await getServerSession(authOptions);
  const myId = String((session?.user as any)?.id || '');
  if (!myId || (session?.user as any)?.role !== 'ALIADO') throw new Error('Not authorized');
  if (!((session?.user as any)?.emailVerified === true)) throw new Error('Email not verified');
  await autoExpireQuotes();
  const where: any = { sellerId: myId };
  if (filters?.status) {
    const st = String(filters.status).toUpperCase();
    if (['BORRADOR','ENVIADO','APROBADO','RECHAZADO','VENCIDO'].includes(st)) where.status = st as any;
  }
  if (filters?.from || filters?.to) {
    const createdAt: any = {};
    if (filters.from) { const d = new Date(String(filters.from)); if (!isNaN(d.getTime())) createdAt.gte = d as any; }
    if (filters.to) { const d = new Date(String(filters.to)); if (!isNaN(d.getTime())) { const next = new Date(d); next.setDate(next.getDate()+1); createdAt.lt = next as any; } }
    if (Object.keys(createdAt).length) where.createdAt = createdAt;
  }
  if (filters?.q) {
    const q = String(filters.q);
    where.OR = [
      { id: { contains: q } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
    ];
  }
  return prisma.quote.findMany({ where, include: { user: true, seller: true, items: true }, orderBy: { createdAt: 'desc' } });
}

// Ally-only: get quote by id (must belong to ally as seller)
export async function getAllyQuoteById(id: string) {
  const session = await getServerSession(authOptions);
  const myId = String((session?.user as any)?.id || '');
  if (!myId || (session?.user as any)?.role !== 'ALIADO') throw new Error('Not authorized');
  if (!((session?.user as any)?.emailVerified === true)) throw new Error('Email not verified');
  await autoExpireQuotes();
  const quote = await prisma.quote.findUnique({ where: { id }, include: { user: true, seller: true, items: { include: { product: true } } } });
  if (!quote || String(quote.sellerId || '') !== myId) throw new Error('Not authorized');
  return quote;
}

export async function updateQuoteStatusByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN' && (session?.user as any)?.role !== 'VENDEDOR' && (session?.user as any)?.role !== 'ALIADO') {
    throw new Error('Not authorized');
  }
  if ((session?.user as any)?.role === 'ALIADO' && !((session?.user as any)?.emailVerified === true)) {
    throw new Error('Email not verified');
  }
  const id = String(formData.get('quoteId') || '');
  const statusRaw = String(formData.get('status') || '').toUpperCase();
  const allowed = ['BORRADOR','ENVIADO','APROBADO','RECHAZADO','VENCIDO'];
  const status = allowed.includes(statusRaw) ? statusRaw : 'BORRADOR';
  // If aliado, ensure ownership
  if ((session?.user as any)?.role === 'ALIADO') {
    const q = await prisma.quote.findUnique({ where: { id }, select: { sellerId: true } });
    if (!q || String(q.sellerId || '') !== String((session?.user as any)?.id || '')) throw new Error('Not authorized');
  }
  await prisma.quote.update({ where: { id }, data: { status: status as any } });
  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'QUOTE_STATUS', details: `${id}:${status}` } }); } catch {}
  try { revalidatePath('/dashboard/admin/presupuestos'); } catch {}
  try { revalidatePath(`/dashboard/admin/presupuestos/${id}`); } catch {}
  const backTo = String(formData.get('backTo') || '') || `/dashboard/admin/presupuestos/${id}`;
  redirect(`${backTo}?message=${encodeURIComponent('Estado actualizado a ' + status)}`);
}

export async function convertQuoteToOrder(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN' && (session?.user as any)?.role !== 'VENDEDOR') {
    throw new Error('Not authorized');
  }
  const id = String(formData.get('quoteId') || '');
  const shippingOption = String(formData.get('shippingOption') || '').toUpperCase();
  const quote = await prisma.quote.findUnique({ where: { id }, include: { items: true, user: true } });
  if (!quote) throw new Error('Quote not found');
  const order = await prisma.order.create({
    data: {
      userId: quote.userId,
      sellerId: quote.sellerId || null,
      originQuoteId: id,
      subtotalUSD: quote.subtotalUSD as any,
      ivaPercent: quote.ivaPercent as any,
      tasaVES: quote.tasaVES as any,
      totalUSD: quote.totalUSD as any,
      totalVES: quote.totalVES as any,
      status: 'PENDIENTE' as any,
      items: { create: quote.items.map(it => ({ productId: it.productId, name: it.name, priceUSD: it.priceUSD as any, quantity: it.quantity })) },
    },
  });
  // Create default shipping for in-store handling
  try {
    // detect city from user's last address
    const addr = await prisma.address.findFirst({ where: { userId: quote.userId }, orderBy: { createdAt: 'desc' } });
    const isBarinas = !!addr && /barinas/i.test(String(addr?.city || ''));
    let carrier: any = isBarinas ? ('RETIRO_TIENDA' as any) : ('FLETE_PRIVADO' as any);
    if (shippingOption === 'RETIRO_TIENDA') carrier = 'RETIRO_TIENDA' as any;
    if (shippingOption === 'DELIVERY') carrier = 'DELIVERY' as any;
    const observations = (isBarinas || shippingOption) ? 'Cliente en Barinas: retiro en tienda o delivery incluido' : '';
    await prisma.shipping.create({
      data: {
        orderId: order.id,
        carrier,
        tracking: '',
        status: 'PENDIENTE' as any,
        channel: 'TIENDA' as any,
        observations,
      },
    });
  } catch {}
  await prisma.quote.update({ where: { id }, data: { status: 'APROBADO' as any } });
  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'QUOTE_CONVERT_ORDER', details: `${id}->${order.id}` } }); } catch {}
  revalidatePath('/dashboard/admin/presupuestos');
  revalidatePath('/dashboard/admin/envios');
  try { revalidatePath('/dashboard/admin/envios/tienda'); } catch {}
  revalidatePath('/dashboard/admin/ventas');
  redirect(`/dashboard/admin/ventas?message=${encodeURIComponent('Venta creada desde presupuesto ' + id + ' (orden ' + order.id + ')')}`);
}

export async function updateQuoteExpiryByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN' && (session?.user as any)?.role !== 'VENDEDOR') {
    throw new Error('Not authorized');
  }
  const id = String(formData.get('quoteId') || '');
  const expiresStr = String(formData.get('expiresAt') || '');
  const expiresAt = expiresStr ? new Date(expiresStr) : null;
  await prisma.quote.update({ where: { id }, data: { expiresAt: expiresAt as any } });
  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'QUOTE_SET_EXPIRES', details: `${id}:${expiresStr}` } }); } catch {}
  try { revalidatePath('/dashboard/admin/presupuestos'); } catch {}
  try { revalidatePath(`/dashboard/admin/presupuestos/${id}`); } catch {}
  const backTo = String(formData.get('backTo') || '') || `/dashboard/admin/presupuestos/${id}`;
  redirect(`${backTo}?message=${encodeURIComponent('Vencimiento actualizado')}`);
}

export async function updateQuoteByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || '');
  if (!['ADMIN','VENDEDOR','ALIADO'].includes(role)) throw new Error('Not authorized');

  const id = String(formData.get('quoteId') || '');
  const itemsJson = String(formData.get('items') || '[]');
  const items: Array<{ productId: string; name: string; priceUSD: number; quantity: number } > = JSON.parse(itemsJson || '[]');
  const ivaPercentForm = formData.get('ivaPercent');
  const customerTaxId = (String(formData.get('customerTaxId') || '').trim() || null);
  const customerFiscalAddress = (String(formData.get('customerFiscalAddress') || '').trim() || null);
  const notes = String(formData.get('notes') || '');
  const backTo = String(formData.get('backTo') || '') || `/dashboard/admin/presupuestos/${id}`;

  const q = await prisma.quote.findUnique({ where: { id }, select: { sellerId: true } });
  if (!q) throw new Error('Quote not found');
  if (role === 'ALIADO') {
    const myId = String((session?.user as any)?.id || '');
    if (String(q.sellerId || '') !== myId) throw new Error('Not authorized');
  }

  if (!Array.isArray(items) || !items.length) {
    redirect(`${backTo}?error=${encodeURIComponent('Debes agregar al menos un producto')}`);
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const ivaPercent = ivaPercentForm !== null ? Number(ivaPercentForm) : Number(settings?.ivaPercent || 16);
  const tasaVES = Number(settings?.tasaVES || 40);

  const pricing = await getPriceAdjustmentSettings();
  const pricedItems = await buildAdjustedQuoteItems(items, pricing);
  const subtotalUSD = pricedItems.reduce((acc, it) => acc + (Number(it.priceUSD) * Number(it.quantity)), 0);
  const totalUSD = subtotalUSD * (1 + ivaPercent/100);
  const totalVES = totalUSD * tasaVES;

  await prisma.$transaction(async (tx) => {
    await tx.quote.update({ where: { id }, data: {
      subtotalUSD: subtotalUSD as any,
      ivaPercent: ivaPercent as any,
      tasaVES: tasaVES as any,
      totalUSD: totalUSD as any,
      totalVES: totalVES as any,
      notes: notes || null,
      customerTaxId: customerTaxId as any,
      customerFiscalAddress: customerFiscalAddress as any,
    } });
    await tx.quoteItem.deleteMany({ where: { quoteId: id } });
    await tx.quoteItem.createMany({ data: pricedItems.map((it) => ({ quoteId: id, productId: it.productId, name: it.name, priceUSD: it.priceUSD as any, quantity: Number(it.quantity) })) });
  });

  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'QUOTE_UPDATE_ITEMS', details: id } }); } catch {}
  try { revalidatePath('/dashboard/aliado/presupuestos'); } catch {}
  try { revalidatePath(`/dashboard/aliado/presupuestos/${id}`); } catch {}
  try { revalidatePath('/dashboard/admin/presupuestos'); } catch {}
  try { revalidatePath(`/dashboard/admin/presupuestos/${id}`); } catch {}
  redirect(`${backTo}?message=${encodeURIComponent('Presupuesto actualizado')}`);
}
