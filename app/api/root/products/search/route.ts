import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions as any);
  const user = (session?.user as any) || {};
  const email = String(user?.email || '').toLowerCase();
  const role = String(user?.role || '');
  const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
  const isRoot = role === 'ADMIN' && email === rootEmail;
  if (!isRoot) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  const where: any = { rootNoIvaOnly: true };
  if (q.trim().length) {
    const tokens = q.trim().split(/\s+/).filter(Boolean);
    where.AND = tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: 'insensitive' } },
        { sku: { contains: token, mode: 'insensitive' } },
        { barcode: { contains: token } },
      ],
    }));
  }
  const products = await prisma.product.findMany({
    where,
    select: { id: true, name: true, sku: true, priceUSD: true },
    take: 25,
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(
    products.map((p) => ({
      ...p,
      priceUSD: Number(p.priceUSD || 0),
    })),
  );
}
