import { NextResponse } from 'next/server';

type Intent =
  | 'greet'
  | 'site_help'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'buy'
  | 'set_address'
  | 'set_payment'
  | 'confirm'
  | 'search';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const text = String(body?.text || '').trim();
    if (!text) return NextResponse.json({ error: 'text requerido' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY || '';

    // 1) Intent con OpenAI (cuando hay API key)
    if (apiKey) {
      const sys = `Eres un extractor de intención de compra y de navegación en el sitio Carpihogar.com.
Devuelve SOLO un JSON con la siguiente forma:
{
  "intent": "greet"|"site_help"|"add_to_cart"|"remove_from_cart"|"buy"|"set_address"|"set_payment"|"confirm"|"search",
  "entities": {
    "productName"?: string,
    "quantity"?: number,
    "addressId"?: string,
    "paymentMethod"?: "ZELLE"|"PAGO_MOVIL"|"TRANSFERENCIA"|"OTRO",
    "color"?: string,
    "model"?: string,
    "section"?: "moodboard"|"personalizador"|"home"|"productos"|"novedades"|"contacto"|"cart"
  }
}
Reglas:
- Usa "greet" cuando el mensaje sea principalmente un saludo o small-talk inicial (hola, buenos días, etc.) sin intención clara de compra.
- Usa "site_help" cuando el usuario pregunte por secciones o funcionalidades de la web (moodboard, personalizador de muebles, carrito, checkout, novedades, contacto).
- Usa "set_payment" cuando el usuario hable de cómo quiere pagar o mencione Zelle, pago móvil o transferencia; en ese caso, rellena "paymentMethod" con "ZELLE", "PAGO_MOVIL" o "TRANSFERENCIA".
- Usa "add_to_cart" / "remove_from_cart" / "buy" / "set_address" / "confirm" solo cuando haya una intención clara de compra.
- Si no es claro, usa intent "search" y entities vacíos.`;

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: text },
          ],
          temperature: 0.2,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const content = json?.choices?.[0]?.message?.content || '{}';
        try {
          const parsed = JSON.parse(content);
          return NextResponse.json(parsed);
        } catch {
          // Si el contenido no es JSON válido, seguimos al fallback heurístico
        }
      }
    }

    // 2) Fallback heurístico sin OpenAI o en caso de error
    const low = text.toLowerCase();
    let intent: Intent = 'search';
    const entities: any = {};

    // Saludos claros sin intención de compra
    if (
      /(^|\s)(hola|buenas|buenos dias|buenos días|buenas tardes|buenas noches|hey|oye|qué tal|que tal|como estas|cómo estás)([!\.\s]|$)/i.test(
        text,
      )
    ) {
      intent = 'greet';
    }

    // Ayuda sobre secciones/funcionalidades del sitio
    if (/moodboard/.test(low)) {
      intent = 'site_help';
      entities.section = 'moodboard';
    } else if (/personaliz(ar|ador)|ecpd|configurador/.test(low)) {
      intent = 'site_help';
      entities.section = 'personalizador';
    } else if (/carrito|mi carrito|ver carrito|mostrar carrito|muestrame el carrito|muestreme el carrito/.test(low)) {
      intent = 'site_help';
      entities.section = 'cart';
    } else if (/checkout|finalizar compra/.test(low)) {
      intent = 'site_help';
      entities.section = 'cart';
    } else if (/inicio|portada|home/.test(low)) {
      intent = 'site_help';
      entities.section = 'home';
    } else if (/novedades|nuevos productos|lanzamientos/.test(low)) {
      intent = 'site_help';
      entities.section = 'novedades';
    } else if (/contacto|contactarnos|soporte|ayuda/.test(low)) {
      intent = 'site_help';
      entities.section = 'contacto';
    }

    // Método de pago explícito (Zelle / pago móvil / transferencia)
    const hasZelle = /zelle/.test(low);
    const hasPagoMovil = /pago m[oó]vil|pago movil|pago-m[oó]vil/.test(low);
    const hasTransfer = /transferenc/i.test(low);

    if (hasZelle || hasPagoMovil || hasTransfer) {
      intent = 'set_payment';
      if (hasZelle) entities.paymentMethod = 'ZELLE';
      else if (hasPagoMovil) entities.paymentMethod = 'PAGO_MOVIL';
      else if (hasTransfer) entities.paymentMethod = 'TRANSFERENCIA';
    }

    // Intenciones de compra genéricas
    if (/agrega|añade|anade|meter|pon|agregar|añadir/.test(low)) intent = 'add_to_cart';
    if (/quitar|remueve|elimina|saca/.test(low)) intent = 'remove_from_cart';
    if (/comprar|cómpralo|compralo|lo quiero|quiero comprar|proceder al pago|ir a pagar|pagar ahora|finalizar compra/.test(low))
      intent = 'buy';
    if (/direcci[oó]n|env[ií]alo a|enviar a/.test(low)) intent = 'set_address';
    if (!entities.paymentMethod && /pago|pagar|m[eé]todo de pago/.test(low)) intent = 'set_payment';
    if (/s[ií] autorizo|si autorizo|confirmar/.test(low)) intent = 'confirm';

    const quantityMatch = low.match(/(\d{1,2})\s*(u|unidades|uds|unidad)?/);
    if (quantityMatch) entities.quantity = parseInt(quantityMatch[1], 10);

    // Producto (muy aproximado) para búsquedas / add_to_cart
    const prod = low
      .replace(
        /(comprar|agrega|añade|anade|meter|pon|quiero|deseo|hola|buenas|buenos dias|buenos días|buenas tardes|buenas noches)/g,
        '',
      )
      .trim();
    if (prod && prod.split(' ').length >= 1) entities.productName = prod;

    return NextResponse.json({ intent, entities });
  } catch {
    return NextResponse.json({ error: 'intent error' }, { status: 200 });
  }
}
