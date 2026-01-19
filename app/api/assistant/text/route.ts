import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runPurchaseConversation } from '@/server/assistant/purchase/flowController';
import * as ProductsSearch from '@/agents/carpihogar-ai-actions/tools/products/searchProducts';
import * as CartView from '@/agents/carpihogar-ai-actions/tools/cart/viewCart';
import { runChatkitAgent } from '@/server/assistant/chatkitAgent';
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
  const setCookieHeader = `${ASSISTANT_SESSION_COOKIE}=${encodeURIComponent(
    sessionId,
  )}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax; HttpOnly`;
  return { sessionId, setCookieHeader };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = String(body?.text || '').trim();
  const history = Array.isArray(body?.history) ? body.history : [];

  const { sessionId, setCookieHeader } = getOrCreateAssistantSession(req);

  if (!text) {
    const res = NextResponse.json({ type: 'text', message: 'Â¿Puedes escribir tu consulta?' });
    if (setCookieHeader) res.headers.append('Set-Cookie', setCookieHeader);
    return res;
  }

  let customerId: string | undefined = undefined;
  try {
    const session = await getServerSession(authOptions);
    customerId = (session?.user as any)?.id as string | undefined;
  } catch {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: any) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n\n'));

      (async () => {
        try {
          // 1) Intentar primero el flujo de compra guiado (add_to_cart, buy, greet, site_help, etc.)
          const flow = await runPurchaseConversation({ customerId, sessionId, message: text, context: body?.context || {} });
          const msgs = Array.isArray(flow?.messages) ? flow.messages : [];
          const ui = Array.isArray(flow?.uiActions) ? flow.uiActions : [];
          if (msgs.length || ui.length) {
            for (const m of msgs) {
              const t = String(m?.type || '').toLowerCase();
              if (t === 'text') emit({ type: 'text', message: String(m?.content || m?.message || ''), actions: m?.actions || [] });
              else if (t === 'products') emit({ type: 'products', products: m?.products || m?.data || [] });
              else if (t === 'cart') emit({ type: 'cart', data: m?.data || {} });
              else emit({ type: 'text', message: String(m?.content || '') });
            }
            for (const a of ui) emit(a);
            return;
          }

          // 2) BÃºsqueda de productos (fallback) + respuesta conversacional
          const res = await ProductsSearch.run({ q: text });
          const products = Array.isArray(res?.data) ? res.data : [];

          if (products.length) {
            let reply: string | null = null;
            let effects: any = null;
            try {
              const summary = products.slice(0, 5).map((p: any) => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                priceUSD: p.priceUSD,
              }));
              const chatkit = await runChatkitAgent({
                text,
                history,
                productsSummary: summary,
                customerId,
                sessionId,
              });
              reply = chatkit?.reply || null;
              effects = chatkit?.effects || null;
            } catch {
              // si falla Chatkit, usamos mensaje simple por defecto
            }

            emit({
              type: 'text',
              message:
                reply ||
                'Perfecto, encontre varias opciones que pueden servirte. Te muestro algunas para que elijas la que mejor se adapta a tu espacio.',
            });
            emit({ type: 'products', products } as any);
            if (effects?.cart || effects?.cartChanged) {
              let cartPayload = effects?.cart || null;
              if (!cartPayload && effects?.cartChanged) {
                const cart = await CartView.run({ customerId, sessionId });
                cartPayload = cart?.data || null;
              }
              if (cartPayload) emit({ type: 'cart', data: cartPayload });
            }
          } else {
            let reply: string | null = null;
            let effects: any = null;
            try {
              const chatkit = await runChatkitAgent({
                text,
                history,
                customerId,
                sessionId,
              });
              reply = chatkit?.reply || null;
              effects = chatkit?.effects || null;
            } catch {
              // ignore
            }
            emit({
              type: 'text',
              message:
                reply ||
                'No encontre coincidencias exactas. Puedes darme un poco mas de detalles? (marca, tipo, color, medida o donde lo quieres usar)',
            });
            if (effects?.products?.length) {
              emit({ type: 'products', products: effects.products } as any);
            }
            if (effects?.cart || effects?.cartChanged) {
              let cartPayload = effects?.cart || null;
              if (!cartPayload && effects?.cartChanged) {
                const cart = await CartView.run({ customerId, sessionId });
                cartPayload = cart?.data || null;
              }
              if (cartPayload) emit({ type: 'cart', data: cartPayload });
            }
          }
        } catch (e) {
          emit({
            type: 'text',
            message: 'Tu mensaje fue recibido, pero hubo un problema procesÃ¡ndolo.',
          });
        } finally {
          try {
            controller.close();
          } catch {}
        }
      })();
    },
  });

  const response = new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
  if (setCookieHeader) response.headers.append('Set-Cookie', setCookieHeader);
  return response;
}

