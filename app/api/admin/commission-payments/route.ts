import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const ALLOWED_METHODS = new Set(['EFECTIVO', 'PAGO_MOVIL', 'TRANSFERENCIA']);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions as any);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const sellerId = String(body?.sellerId || '').trim();
  if (!sellerId) {
    return NextResponse.json({ error: 'Vendedor requerido' }, { status: 400 });
  }

  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { id: true, role: true },
  });
  if (!seller || seller.role !== 'VENDEDOR') {
    return NextResponse.json({ error: 'Vendedor no encontrado' }, { status: 404 });
  }

  const amountRaw = String(body?.amount || '').trim();
  const amount = Number(amountRaw);
  if (!amountRaw || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Monto invalido' }, { status: 400 });
  }

  const paidAtRaw = String(body?.paidAt || '').trim();
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : null;
  if (!paidAt || isNaN(paidAt.getTime())) {
    return NextResponse.json({ error: 'Fecha de pago invalida' }, { status: 400 });
  }

  const method = String(body?.method || '').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ error: 'Metodo de pago invalido' }, { status: 400 });
  }

  const currency = method === 'EFECTIVO' ? 'USD' : 'VES';
  const reference = String(body?.reference || '').trim();
  const bankName = String(body?.bankName || '').trim();
  if (method !== 'EFECTIVO') {
    if (!reference) {
      return NextResponse.json({ error: 'Referencia requerida' }, { status: 400 });
    }
    if (!bankName) {
      return NextResponse.json({ error: 'Banco requerido' }, { status: 400 });
    }
  }

  const paidByNameRaw = String(body?.paidByName || '').trim();
  const paidByName =
    paidByNameRaw ||
    String((session?.user as any)?.name || (session?.user as any)?.email || '').trim() ||
    null;

  const proofUrl = String(body?.proofUrl || '').trim() || null;

  const payment = await prisma.commissionPayment.create({
    data: {
      sellerId,
      amount: amount as any,
      currency: currency as any,
      method: method as any,
      reference: reference || null,
      bankName: bankName || null,
      paidAt: paidAt as any,
      paidByName: paidByName || null,
      proofUrl,
      createdById: (session?.user as any)?.id || null,
    },
  });

  return NextResponse.json({ ok: true, id: payment.id });
}
