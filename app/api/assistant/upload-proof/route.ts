import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { run as savePaymentProof } from '@/agents/carpihogar-ai-actions/tools/order/savePaymentProof';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_PROOF_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_PROOF_BYTES = 5 * 1024 * 1024; // 5MB

async function latestOrderId(customerId: string): Promise<string | null> {
  try {
    const o = await prisma.order.findFirst({
      where: { userId: customerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return o?.id || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    const session = await getServerSession(authOptions);
    const customerId = (session?.user as any)?.id as string | undefined;
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const orderIdFromForm = String(form.get('orderId') || '').trim();
    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'Archivo de imagen requerido' },
        { status: 400 },
      );
    }

    const mimeRaw = (file as any)?.type || 'image/jpeg';
    const mime = String(mimeRaw || '').toLowerCase();
    const sizeBytes = (file as any)?.size ?? 0;

    if (!ALLOWED_PROOF_IMAGE_TYPES.includes(mime)) {
      return NextResponse.json(
        { ok: false, error: 'Tipo de imagen no permitido. Usa JPG, PNG o WEBP.' },
        { status: 415 },
      );
    }

    if (sizeBytes > MAX_PROOF_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'El archivo es demasiado grande (max 5MB).' },
        { status: 413 },
      );
    }

    const arrayBuf = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString('base64');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'OPENAI_API_KEY no configurada' },
        { status: 500 },
      );
    }

    const sys =
      'Eres un asistente que extrae datos de soportes de pago. Devuelve SOLO JSON con: method ("Zelle"|"Pago Movil"|"Transferencia Bancaria"), currency ("USD"|"VES"), amountUSD (numero, si aplica), amountVES (numero, si aplica), reference (string).';
    const body = {
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Lee la imagen y devuelve SOLO JSON valido con los campos solicitados.',
            },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          ] as any,
        },
      ],
    } as any;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return NextResponse.json(
        { ok: false, error: `OpenAI error ${resp.status}: ${txt}` },
        { status: 500 },
      );
    }
    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content || '';
    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {}
    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'No pude extraer datos del soporte.' },
        { status: 200 },
      );
    }

    const rawMethod = String(parsed.method || '').toLowerCase();
    const method = /zelle/.test(rawMethod)
      ? 'ZELLE'
      : /movil|m\u00f3vil/.test(rawMethod)
        ? 'PAGO_MOVIL'
        : 'TRANSFERENCIA';
    const currency = String(parsed.currency || '').toUpperCase() === 'VES' ? 'VES' : 'USD';
    const amountUSDFromJson = Number(parsed.amountUSD || 0) || 0;
    const amountVESFromJson = Number(parsed.amountVES || 0) || 0;
    let amountUSD = amountUSDFromJson;
    if ((!amountUSD || amountUSD <= 0) && amountVESFromJson > 0) {
      try {
        const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
        const tasa = Number(settings?.tasaVES || 0) || 0;
        if (tasa > 0) amountUSD = amountVESFromJson / tasa;
      } catch {}
    }
    amountUSD = Number(amountUSD.toFixed(2));
    const reference = String(parsed.reference || '').slice(0, 80) || undefined;

    let submitted: any = { success: false };
    let orderId: string | null = null;
    if (customerId) {
      if (orderIdFromForm) {
        const owned = await prisma.order.findFirst({
          where: { id: orderIdFromForm, userId: customerId },
          select: { id: true },
        });
        orderId = owned?.id || null;
        if (!orderId) {
          submitted = { success: false, message: 'Orden no encontrada' };
        }
      } else {
        orderId = await latestOrderId(customerId);
      }
      if (orderId) {
        submitted = await savePaymentProof({
          orderId,
          method: method as any,
          currency: currency as any,
          reference,
        });
      }
    }

    const receiptUrl = orderId
      ? `${origin}/api/orders/${orderId}/pdf?tipo=recibo&moneda=${currency}`
      : undefined;

    return NextResponse.json({
      ok: true,
      parsed: { method, currency, amountUSD, reference },
      submitted,
      orderId,
      receiptUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
