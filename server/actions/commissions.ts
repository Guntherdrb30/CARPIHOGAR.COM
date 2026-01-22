'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

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

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  return session;
}

export async function getSellerCommissionSummary() {
  await requireAdmin();
  const sellers = await prisma.user.findMany({
    where: { role: 'VENDEDOR' },
    select: { id: true, name: true, email: true, commissionPercent: true },
    orderBy: { name: 'asc' },
  });

  const settings = await prisma.siteSettings.findUnique({
    where: { id: 1 },
    select: { sellerCommissionPercent: true },
  });
  const defaultCommissionPercent = toNumberSafe(settings?.sellerCommissionPercent, 0);

  if (!sellers.length) {
    return { sellers: [], defaultCommissionPercent };
  }

  const sellerIds = sellers.map((s) => s.id);
  const [salesAgg, commissionAgg] = await Promise.all([
    prisma.order.groupBy({
      by: ['sellerId'],
      where: { sellerId: { in: sellerIds } },
      _sum: { totalUSD: true },
      _count: { _all: true },
    }),
    prisma.commission.groupBy({
      by: ['sellerId'],
      where: { sellerId: { in: sellerIds } },
      _sum: { amountUSD: true },
    }),
  ]);

  const salesMap = new Map(salesAgg.map((row) => [String(row.sellerId || ''), row]));
  const commissionMap = new Map(commissionAgg.map((row) => [String(row.sellerId || ''), row]));

  const rows = sellers.map((s) => {
    const salesRow = salesMap.get(String(s.id));
    const commissionRow = commissionMap.get(String(s.id));
    return {
      id: s.id,
      name: s.name || '',
      email: s.email || '',
      commissionPercent: s.commissionPercent == null ? null : toNumberSafe(s.commissionPercent, 0),
      totalSalesUSD: toNumberSafe(salesRow?._sum?.totalUSD, 0),
      totalCommissionUSD: toNumberSafe(commissionRow?._sum?.amountUSD, 0),
      salesCount: Number(salesRow?._count?._all || 0),
    };
  });

  rows.sort((a, b) => b.totalSalesUSD - a.totalSalesUSD);

  return { sellers: rows, defaultCommissionPercent };
}

export async function getSellerCommissionOverview(sellerId: string) {
  await requireAdmin();
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { id: true, name: true, email: true, commissionPercent: true, role: true },
  });
  if (!seller || seller.role !== 'VENDEDOR') throw new Error('Seller not found');

  const settings = await prisma.siteSettings.findUnique({
    where: { id: 1 },
    select: { sellerCommissionPercent: true },
  });
  const defaultCommissionPercent = toNumberSafe(settings?.sellerCommissionPercent, 0);

  const [salesAgg, commissionAgg] = await Promise.all([
    prisma.order.aggregate({
      where: { sellerId: seller.id },
      _sum: { totalUSD: true },
      _count: { _all: true },
    }),
    prisma.commission.aggregate({
      where: { sellerId: seller.id },
      _sum: { amountUSD: true },
    }),
  ]);

  return {
    seller: {
      id: seller.id,
      name: seller.name || '',
      email: seller.email || '',
      commissionPercent: seller.commissionPercent == null ? null : toNumberSafe(seller.commissionPercent, 0),
    },
    totals: {
      totalSalesUSD: toNumberSafe(salesAgg?._sum?.totalUSD, 0),
      totalCommissionUSD: toNumberSafe(commissionAgg?._sum?.amountUSD, 0),
      salesCount: Number(salesAgg?._count?._all || 0),
    },
    defaultCommissionPercent,
  };
}

export async function getSellerSalesByFilters(params: {
  sellerId: string;
  invoice?: string;
  customer?: string;
  amount?: string;
  take?: number;
}) {
  await requireAdmin();
  const sellerId = String(params.sellerId || '');
  if (!sellerId) throw new Error('sellerId required');

  const where: any = { sellerId };
  const or: any[] = [];

  const invoice = String(params.invoice || '').trim();
  if (invoice) {
    const maybeNumber = Number(invoice);
    if (Number.isFinite(maybeNumber)) {
      or.push({ invoiceNumber: Math.trunc(maybeNumber) });
    }
    or.push({ id: { contains: invoice } });
  }

  const customer = String(params.customer || '').trim();
  if (customer) {
    where.user = {
      is: {
        OR: [
          { name: { contains: customer, mode: 'insensitive' } },
          { email: { contains: customer, mode: 'insensitive' } },
        ],
      },
    };
  }

  const amountRaw = String(params.amount || '').trim();
  if (amountRaw) {
    const amount = Number(amountRaw);
    if (Number.isFinite(amount)) {
      const min = Math.max(0, amount - 0.01);
      const max = amount + 0.01;
      where.totalUSD = { gte: min, lte: max };
    }
  }

  if (or.length) {
    where.OR = or;
  }

  const orders = await prisma.order.findMany({
    where,
    include: { user: true, commission: true },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(Number(params.take || 20), 50)),
  });

  return orders;
}

export async function updateSellerCommissionByForm(formData: FormData) {
  const session = await requireAdmin();
  const sellerId = String(formData.get('sellerId') || '');
  const backTo = String(formData.get('backTo') || '') || `/dashboard/admin/comisiones/${sellerId}`;
  if (!sellerId) {
    redirect(`${backTo}?error=${encodeURIComponent('Vendedor invalido')}`);
  }

  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { id: true, role: true, commissionPercent: true },
  });
  if (!seller || seller.role !== 'VENDEDOR') {
    redirect(`${backTo}?error=${encodeURIComponent('Vendedor no encontrado')}`);
  }

  const raw = String(formData.get('commissionPercent') ?? '').trim();
  let commissionPercent: number | null = null;
  if (raw.length > 0) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      redirect(`${backTo}?error=${encodeURIComponent('Comision invalida')}`);
    }
    commissionPercent = parsed;
  }

  const oldCommission = seller?.commissionPercent;
  await prisma.user.update({
    where: { id: sellerId },
    data: { commissionPercent: (commissionPercent == null ? null : (commissionPercent as any)) as any },
  });

  try {
    await prisma.auditLog.create({
      data: {
        userId: (session?.user as any)?.id,
        action: 'SELLER_COMMISSION_UPDATE',
        details: `target:${sellerId};from:${oldCommission ?? 'null'};to:${commissionPercent ?? 'null'}`,
      },
    });
  } catch {}

  try { revalidatePath('/dashboard/admin/comisiones'); } catch {}
  try { revalidatePath(`/dashboard/admin/comisiones/${sellerId}`); } catch {}

  redirect(`${backTo}?message=${encodeURIComponent('Comision actualizada')}`);
}
