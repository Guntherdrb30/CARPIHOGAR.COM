'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

type SessionUser = {
  id?: string;
  email?: string;
  role?: string;
};

async function requireRootSession() {
  const session = await getServerSession(authOptions);
  const user = (session?.user as SessionUser) || {};
  const email = String(user.email || '').toLowerCase();
  const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
  const isRoot = user.role === 'ADMIN' && email === rootEmail;
  if (!isRoot) {
    throw new Error('Not authorized');
  }
  return { session, user };
}

export async function getRootNoIvaProducts(q?: string) {
  await requireRootSession();
  const where: any = { rootNoIvaOnly: true };
  if (q && q.trim().length) {
    const tokens = q.trim().split(/\s+/).filter(Boolean);
    if (tokens.length) {
      where.AND = tokens.map((token: string) => ({
        OR: [
          { name: { contains: token, mode: 'insensitive' } },
          { sku: { contains: token, mode: 'insensitive' } },
          { barcode: { contains: token } },
        ],
      }));
    }
  }
  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: {
      id: true,
      name: true,
      sku: true,
      priceUSD: true,
      images: true,
      stock: true,
    },
  });
  return products;
}

export async function getRootSecretSales(params?: { q?: string }) {
  await requireRootSession();
  const where: any = {};
  if (params?.q) {
    const term = params.q.trim();
    if (term.length) {
      const noteNumber = Number(term);
      where.OR = [
        ...(Number.isFinite(noteNumber)
          ? [{ noteNumber: noteNumber as any }]
          : []),
        { customerName: { contains: term, mode: 'insensitive' } },
        { customerPhone: { contains: term, mode: 'insensitive' } },
        { customerTaxId: { contains: term, mode: 'insensitive' } },
      ];
    }
  }
  const sales = await prisma.rootSecretSale.findMany({
    where,
    include: {
      items: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return sales;
}

export async function getRootSecretSaleById(id: string) {
  await requireRootSession();
  if (!id) return null;
  const sale = await prisma.rootSecretSale.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, sku: true },
          },
        },
      },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  return sale;
}

export async function createRootSecretSale(formData: FormData) {
  const { session, user } = await requireRootSession();
  const rawItems = String(formData.get('items') || '[]');
  let parsed: Array<{ productId: string; priceUSD: number; quantity: number; name?: string }> = [];
  try {
    parsed = JSON.parse(rawItems || '[]');
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    redirect('/dashboard/admin/root/ventas?error=Debes%20agregar%20al%20menos%20un%20producto');
  }
  const normalizedItems = parsed
    .map((item) => ({
      productId: String(item.productId || '').trim(),
      priceUSD: Number(item.priceUSD || 0),
      quantity: Math.max(1, Number(item.quantity || 0)),
      name: item.name ? String(item.name) : undefined,
    }))
    .filter((item) => item.productId && item.quantity > 0);
  if (!normalizedItems.length) {
    redirect('/dashboard/admin/root/ventas?error=Items%20inv%C3%A1lidos');
  }

  const productIds = Array.from(new Set(normalizedItems.map((i) => i.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, priceUSD: true, stock: true, rootNoIvaOnly: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  for (const item of normalizedItems) {
    const product = productMap.get(item.productId);
    if (!product || !product.rootNoIvaOnly) {
      redirect('/dashboard/admin/root/ventas?error=Producto%20no%20autorizado');
    }
    if (!item.priceUSD || item.priceUSD <= 0) {
      item.priceUSD = Number(product.priceUSD || 0) || 0;
    }
  }

  const subtotalUSD = normalizedItems.reduce(
    (sum, item) => sum + Number(item.priceUSD || 0) * Number(item.quantity || 0),
    0,
  );
  if (!subtotalUSD || subtotalUSD <= 0) {
    redirect('/dashboard/admin/root/ventas?error=Subtotal%20inv%C3%A1lido');
  }

  const customerName = String(formData.get('customerName') || '').trim() || null;
  const customerPhone = String(formData.get('customerPhone') || '').trim() || null;
  const customerTaxId = String(formData.get('customerTaxId') || '').trim() || null;
  const customerFiscalAddress =
    String(formData.get('customerFiscalAddress') || '').trim() || null;
  const observations = String(formData.get('observations') || '').trim() || null;
  const currency: 'USD' = 'USD';
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const tasaVES = Number((settings as any)?.tasaVES || 40);

  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.rootSecretSale.create({
      data: {
        createdById: (session?.user as any)?.id || user.id || null,
        customerName,
        customerPhone,
        customerTaxId,
        customerFiscalAddress,
        observations,
        subtotalUSD: subtotalUSD as any,
        totalUSD: subtotalUSD as any,
        tasaVES: tasaVES as any,
        currency,
        withoutIva: true,
        items: {
          create: normalizedItems.map((item) => ({
            productId: item.productId,
            name: item.name || productMap.get(item.productId)?.name || 'Producto',
            quantity: item.quantity,
            priceUSD: item.priceUSD as any,
            withoutIva: true,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of normalizedItems) {
      const qty = Number(item.quantity || 0);
      if (!qty) continue;
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'SALIDA' as any,
          quantity: qty,
          reason: `ROOT_SECRET_SALE ${created.noteNumber}`,
          userId: (session?.user as any)?.id || null,
        },
      });
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: qty },
          stockUnits: { decrement: qty } as any,
        },
      });
    }
    return created;
  });

  try {
    await prisma.auditLog.create({
      data: {
        userId: (session?.user as any)?.id,
        action: 'ROOT_SECRET_SALE_CREATED',
        details: sale.id,
      },
    });
  } catch {}

  await revalidatePath('/dashboard/admin/root/ventas');
  redirect(
    `/dashboard/admin/root/ventas?message=${encodeURIComponent(
      `Nota ${String(sale.noteNumber).padStart(6, '0')} creada`,
    )}&saleId=${encodeURIComponent(sale.id)}`,
  );
}
