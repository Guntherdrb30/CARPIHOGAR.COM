import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import * as CartAdd from '@/agents/carpihogar-ai-actions/tools/cart/addToCart';
import * as CartRemove from '@/agents/carpihogar-ai-actions/tools/cart/removeFromCart';
import * as CartUpdateQty from '@/agents/carpihogar-ai-actions/tools/cart/updateQty';
import * as CartView from '@/agents/carpihogar-ai-actions/tools/cart/viewCart';
import * as CartClear from '@/agents/carpihogar-ai-actions/tools/cart/clearCart';
import * as SaveAddress from '@/agents/carpihogar-ai-actions/tools/customer/saveAddress';
import crypto from 'crypto';

const ASSISTANT_SESSION_COOKIE = 'assistant_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function getOrCreateAssistantSession(req: Request) {
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${ASSISTANT_SESSION_COOKIE}=([^;]+)`));
  if (match) {
    return { sessionId: decodeURIComponent(match[1]), setCookieHeader: null as string | null };
  }
  const sessionId = crypto.randomUUID();
  const setCookieHeader = `${ASSISTANT_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax; HttpOnly`;
  return { sessionId, setCookieHeader };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const key = String(body?.key || body?.action || '').toLowerCase();
  const payload = body?.payload || {};
  const { sessionId, setCookieHeader } = getOrCreateAssistantSession(req);
  const session = await getServerSession(authOptions);
  const customerId = (session?.user as any)?.id as string | undefined;
  try {
    if (key === 'add_to_cart') {
      const productId = String(payload?.productId || body?.productId || '');
      const quantity = Number(payload?.quantity || body?.qty || 1);
      const r = await CartAdd.run({ customerId, sessionId, productId, quantity });
      const cart = await CartView.run({ customerId, sessionId });
      const res = NextResponse.json({ success: r.success, message: r.message, data: cart?.data || {} });
      if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
      return res;
    }
    if (key === 'view_cart') {
      const cart = await CartView.run({ customerId, sessionId });
      const res = NextResponse.json(cart);
      if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
      return res;
    }
    if (key === 'remove_from_cart') {
      const productId = String(payload?.productId || body?.productId || '');
      const r = await CartRemove.run({ customerId, sessionId, productId });
      const cart = await CartView.run({ customerId, sessionId });
      const res = NextResponse.json({ success: r.success, message: r.message, data: cart?.data || {} });
      if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
      return res;
    }
    if (key === 'update_qty') {
      const productId = String(payload?.productId || body?.productId || '');
      const quantity = Number(payload?.quantity || body?.qty || 1);
      const r = await CartUpdateQty.run({ customerId, sessionId, productId, quantity });
      const cart = await CartView.run({ customerId, sessionId });
      const res = NextResponse.json({ success: r.success, message: r.message, data: cart?.data || {} });
      if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
      return res;
    }
    if (key === 'clear_cart') {
      const r = await CartClear.run({ customerId, sessionId });
      const cart = await CartView.run({ customerId, sessionId });
      const res = NextResponse.json({ success: r.success, message: r.message, data: cart?.data || {} });
      if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
      return res;
    }
    if (key === 'save_address') {
      const r = await SaveAddress.run(payload);
      const res = NextResponse.json(r);
      if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
      return res;
    }
    const res = NextResponse.json({ success: false, message: 'Accion no soportada', data: null }, { status: 400 });
    if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
    return res;
  } catch (e: any) {
    const res = NextResponse.json({ success: false, message: String(e?.message || e) }, { status: 500 });
    if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
    return res;
  }
}
