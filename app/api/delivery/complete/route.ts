import { NextResponse } from 'next/server';
import { completeDelivery } from '@/server/actions/shipping';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const orderId = String((body as any)?.orderId || '').trim();

  if (!orderId) {
    return NextResponse.json({ ok: false, error: 'orderId requerido' }, { status: 400 });
  }

  try {
    await completeDelivery(orderId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || e || 'Error al marcar entregado');
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

