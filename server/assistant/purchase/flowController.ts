
import prisma from "@/lib/prisma";
import * as CartView from "@/agents/carpihogar-ai-actions/tools/cart/viewCart";
import * as ListAddresses from "@/agents/carpihogar-ai-actions/tools/customer/listAddresses";
import * as SaveAddress from "@/agents/carpihogar-ai-actions/tools/customer/saveAddress";
import { getSettings } from "@/server/actions/settings";
import { getPriceAdjustmentSettings } from "@/server/price-adjustments";

export type FlowResult = { messages: any[]; uiActions?: any[]; audioUrl?: string };

type Currency = "USD" | "VES";
type PaymentMethod = "ZELLE" | "PAGO_MOVIL" | "TRANSFERENCIA";

type AssistantContext = {
  addressId?: string;
  currency?: Currency;
  paymentMethod?: PaymentMethod;
  awaitingAddress?: boolean;
  awaitingCurrency?: boolean;
  awaitingPayment?: boolean;
};

function normalizeText(text: string) {
  try {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  } catch {
    return text.toLowerCase();
  }
}

function detectCurrency(text: string): Currency | undefined {
  const t = normalizeText(text);
  if (/(\busd\b|\bdolar\b|\bdolares\b|\$)/.test(t)) return "USD";
  if (/(\bves\b|\bbolivar\b|\bbolivares\b|\bbs\b)/.test(t)) return "VES";
  return undefined;
}

function detectPaymentMethod(text: string): PaymentMethod | undefined {
  const t = normalizeText(text);
  if (/zelle/.test(t)) return "ZELLE";
  if (/pago movil|pago-movil|pagomovil/.test(t)) return "PAGO_MOVIL";
  if (/transferenc/.test(t)) return "TRANSFERENCIA";
  return undefined;
}

function looksLikeAddress(text: string) {
  const t = normalizeText(text);
  if (t.length < 10) return false;
  if (/\d{1,5}/.test(t)) return true;
  if (/(av|avenida|calle|urbanizacion|urb|sector|residencia|res|carrera|edif|edificio|casa|apto|apartamento|local)/.test(t)) return true;
  return t.split(" ").length >= 4;
}

function formatAddressLabel(a: any) {
  const parts = [a?.address1, a?.zone, a?.city, a?.state].filter(Boolean);
  const label = parts.join(", ").trim();
  return label || "Direccion";
}

function urlFor(base: string, path: string) {
  try {
    return new URL(path, base).toString();
  } catch {
    return path;
  }
}

export async function runPurchaseConversation({
  customerId,
  sessionId,
  message,
  context,
}: {
  customerId?: string;
  sessionId?: string;
  message: string;
  context?: AssistantContext;
}): Promise<FlowResult> {
  const base = (() => {
    const p1 = (process.env.NEXT_PUBLIC_URL || "").trim();
    if (p1) return p1;
    const p2 = (process.env.NEXTAUTH_URL || "").trim();
    if (p2) return p2;
    const vercel = (process.env.VERCEL_URL || "").trim();
    if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;
    return "http://localhost:3000";
  })();

  const intentUrl = new URL("/api/assistant/intent", base).toString();
  const intentRes = await fetch(intentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  })
    .then((r) => r.json())
    .catch(() => ({ intent: "search", entities: {} }));

  const intent = String(intentRes?.intent || "search");
  const entities = intentRes?.entities || {};

  const ctx: AssistantContext = { ...(context || {}) };
  const currencyFromText = detectCurrency(message);
  const methodFromText = detectPaymentMethod(message);
  if (!ctx.currency && currencyFromText) ctx.currency = currencyFromText;
  if (!ctx.paymentMethod && methodFromText) ctx.paymentMethod = methodFromText;

  const pushText = (arr: any[], content: string, actions?: { key: string; label: string }[]) => {
    arr.push({ role: "assistant", type: "text", content, actions });
  };

  if (intent === "greet") {
    let name: string | undefined;
    try {
      if (customerId) {
        const user = await prisma.user.findUnique({
          where: { id: customerId },
          select: { name: true },
        });
        name = (user?.name || "").trim() || undefined;
      }
    } catch {}
    const saludo = name ? `Hola ${name}.` : "Hola.";
    const texto = [
      saludo,
      "Soy tu asistente de Carpihogar.",
      "Puedo recomendar productos, armar tu carrito y guiarte al pago.",
      "Que te gustaria hacer hoy?",
    ].join(" ");
    return { messages: [{ role: "assistant", type: "text", content: texto }] } as any;
  }

  if (intent === "site_help") {
    const section = String(entities?.section || "").toLowerCase();
    let content = "";
    if (section === "moodboard") {
      content = "Puedes crear Moodboards aqui: " + urlFor(base, "/moodboard");
    } else if (section === "personalizador") {
      content = "Abre el personalizador de muebles aqui: " + urlFor(base, "/personalizar-muebles");
    } else if (section === "cart") {
      content = "Tu carrito esta en " + urlFor(base, "/carrito") + ". Puedo mostrarte un resumen si quieres.";
    } else if (section === "home") {
      content = "Inicio: " + urlFor(base, "/");
    } else if (section === "novedades") {
      content = "Novedades: " + urlFor(base, "/novedades");
    } else if (section === "contacto") {
      content = "Contacto: " + urlFor(base, "/contacto");
    } else {
      content = "Puedo ayudarte con Moodboard, personalizador, carrito, novedades o contacto. Dime que necesitas.";
    }
    return { messages: [{ role: "assistant", type: "text", content }] } as any;
  }

  if (intent === "add_to_cart") {
    const { handleAddToCart } = await import("./handleAddToCart");
    return await handleAddToCart({ customerId, sessionId, entities, message });
  }

  if (intent === "remove_from_cart") {
    const { handleRemoveFromCart } = await import("./handleRemoveFromCart");
    return await handleRemoveFromCart({ customerId, sessionId, entities, message });
  }

  if (intent === "confirm") {
    const tokenMatch = String(message || "").match(/\b(\d{4,8})\b/);
    const token = tokenMatch?.[1] || "";
    const { handleConfirmOrder } = await import("./handleConfirmOrder");
    if (!customerId) {
      return {
        messages: [
          {
            role: "assistant",
            type: "text",
            content: "Necesito tu sesion para confirmar la compra.",
          },
        ],
      } as any;
    }
    return await handleConfirmOrder({ customerId, token });
  }

  const shouldRunCheckoutFlow =
    intent === "buy" ||
    intent === "set_payment" ||
    intent === "set_address" ||
    Boolean(ctx.awaitingAddress || ctx.awaitingCurrency || ctx.awaitingPayment);

  if (shouldRunCheckoutFlow) {
    const messages: any[] = [];
    const uiActions: any[] = [];

    const cart = await CartView.run({ customerId, sessionId });
    const items = cart?.data?.items || [];
    const totals = cart?.data?.totals || {};

    if (!items.length) {
      pushText(messages, "Tu carrito esta vacio. Dime que producto deseas y te ayudo.");
      return { messages, uiActions } as any;
    }

    uiActions.push({ type: "ui_control", action: "show_cart", payload: { cart: cart?.data || {} } });

    if (!customerId) {
      pushText(
        messages,
        "Para pagar necesito que inicies sesion o te registres. Asi podemos guardar tu direccion y enviarte el recibo.",
        [
          { key: "open_login", label: "Iniciar sesion" },
          { key: "open_register", label: "Crear cuenta" },
          { key: "view_cart", label: "Ver carrito" },
        ],
      );
      uiActions.push({ type: "ui_control", action: "show_cart", payload: { cart: cart?.data || {} } });
      return { messages, uiActions } as any;
    }

    if ((ctx.awaitingAddress || intent === "set_address") && looksLikeAddress(message)) {
      const saved = await SaveAddress.run({ userId: customerId, addressText: message });
      if (saved?.success && saved?.data?.id) {
        ctx.addressId = saved.data.id;
        pushText(messages, "Direccion guardada. Continuemos con el pago.");
        uiActions.push({
          type: "ui_control",
          action: "set_address_context",
          payload: { addressId: saved.data.id },
        });
        uiActions.push({
          type: "ui_control",
          action: "set_flow_state",
          payload: { awaitingAddress: false },
        });
      } else {
        pushText(messages, "No pude guardar la direccion. Puedes intentar de nuevo con mas detalle?");
        uiActions.push({ type: "ui_control", action: "set_flow_state", payload: { awaitingAddress: true } });
        return { messages, uiActions } as any;
      }
    }

    const addressList = await ListAddresses.run({ userId: customerId });
    const addresses = Array.isArray(addressList?.data) ? addressList.data : [];

    if (!ctx.addressId) {
      if (addresses.length) {
        const actions = addresses.slice(0, 4).map((a: any) => ({
          key: `select_address:${a.id}`,
          label: formatAddressLabel(a),
        }));
        pushText(messages, "Selecciona la direccion de envio:", actions);
        uiActions.push({ type: "ui_control", action: "set_flow_state", payload: { awaitingAddress: true } });
      } else {
        pushText(messages, "Dime tu direccion completa para el envio (calle, numero, ciudad, estado).", []);
        uiActions.push({ type: "ui_control", action: "set_flow_state", payload: { awaitingAddress: true } });
      }
      return { messages, uiActions } as any;
    }

    if (!ctx.currency) {
      const pricing = await getPriceAdjustmentSettings();
      const discountPct = Number(pricing.usdPaymentDiscountPercent || 0);
      const discountMsg = pricing.usdPaymentDiscountEnabled && discountPct > 0
        ? `En USD tienes ${discountPct.toFixed(0)}% de descuento.`
        : "";
      pushText(
        messages,
        ["En que moneda deseas pagar?", discountMsg].filter(Boolean).join(" "),
        [
          { key: "choose_currency_usd", label: "USD" },
          { key: "choose_currency_ves", label: "VES" },
        ],
      );
      uiActions.push({ type: "ui_control", action: "set_flow_state", payload: { awaitingCurrency: true } });
      return { messages, uiActions } as any;
    }

    if (!ctx.paymentMethod) {
      if (ctx.currency === "USD") {
        pushText(
          messages,
          "Pago en USD se procesa por Zelle. Deseas usar Zelle?",
          [
            { key: "choose_method_zelle", label: "Zelle" },
            { key: "choose_currency_ves", label: "Prefiero VES" },
          ],
        );
      } else {
        pushText(
          messages,
          "Elige el metodo de pago en VES:",
          [
            { key: "choose_method_pm", label: "Pago movil" },
            { key: "choose_method_transfer", label: "Transferencia" },
          ],
        );
      }
      uiActions.push({ type: "ui_control", action: "set_flow_state", payload: { awaitingPayment: true } });
      return { messages, uiActions } as any;
    }

    const settings = await getSettings();
    const pricing = await getPriceAdjustmentSettings();
    const ivaPercent = Number(totals.ivaPercent || (settings as any)?.ivaPercent || 16);
    const tasaVES = Number(totals.tasaVES || (settings as any)?.tasaVES || 40);
    const subtotalUSD = Number(totals.subtotalUSD || 0);

    let totalUSD = Number(totals.totalUSD || 0);
    let discountUSD = 0;
    if (ctx.currency === "USD" && pricing.usdPaymentDiscountEnabled) {
      const pct = Number(pricing.usdPaymentDiscountPercent || 0) / 100;
      if (pct > 0) {
        discountUSD = subtotalUSD * pct;
        const subtotalAfter = subtotalUSD - discountUSD;
        const ivaUSD = subtotalAfter * (ivaPercent / 100);
        totalUSD = subtotalAfter + ivaUSD;
      }
    }

    const totalVES = totalUSD * tasaVES;

    const lines: string[] = [];
    lines.push("Perfecto, te guio con el pago.");
    if (ctx.currency === "USD") {
      if (discountUSD > 0) {
        lines.push(`Descuento USD aplicado: -$${discountUSD.toFixed(2)}.`);
      }
      lines.push(`Total a pagar: $${totalUSD.toFixed(2)}.`);
    } else {
      lines.push(`Total a pagar: Bs ${totalVES.toFixed(2)}.`);
    }

    if (ctx.paymentMethod === "ZELLE") {
      const email = String((settings as any)?.paymentZelleEmail || "").trim();
      lines.push("Metodo: Zelle (USD).");
      if (email) lines.push(`Correo Zelle: ${email}`);
    } else if (ctx.paymentMethod === "PAGO_MOVIL") {
      const phone = String((settings as any)?.paymentPmPhone || "").trim();
      const rif = String((settings as any)?.paymentPmRif || "").trim();
      const bank = String((settings as any)?.paymentPmBank || "").trim();
      lines.push("Metodo: Pago movil (VES).");
      if (phone) lines.push(`Telefono: ${phone}`);
      if (rif) lines.push(`RIF: ${rif}`);
      if (bank) lines.push(`Banco: ${bank}`);
    } else if (ctx.paymentMethod === "TRANSFERENCIA") {
      lines.push("Metodo: Transferencia bancaria (VES).");
      const bName = String((settings as any)?.paymentBanescoName || "").trim();
      const bAcc = String((settings as any)?.paymentBanescoAccount || "").trim();
      const bRif = String((settings as any)?.paymentBanescoRif || "").trim();
      const mName = String((settings as any)?.paymentMercantilName || "").trim();
      const mAcc = String((settings as any)?.paymentMercantilAccount || "").trim();
      const mRif = String((settings as any)?.paymentMercantilRif || "").trim();
      if (bAcc || bName || bRif) {
        lines.push("Banesco:");
        if (bName) lines.push(`- Titular: ${bName}`);
        if (bAcc) lines.push(`- Cuenta: ${bAcc}`);
        if (bRif) lines.push(`- RIF: ${bRif}`);
      }
      if (mAcc || mName || mRif) {
        lines.push("Mercantil:");
        if (mName) lines.push(`- Titular: ${mName}`);
        if (mAcc) lines.push(`- Cuenta: ${mAcc}`);
        if (mRif) lines.push(`- RIF: ${mRif}`);
      }
    }

    lines.push("Haz el pago y envia el comprobante por este chat para revisarlo.");
    lines.push("Tu pago sera revisado; luego procederemos al envio y te enviaremos el recibo de pago.");
    lines.push("Muchas gracias por tu compra.");

    pushText(messages, lines.join("\n"));
    return { messages, uiActions } as any;
  }

  if (intent === "search") {
    return { messages: [], uiActions: [] } as any;
  }

  return {
    messages: [
      {
        role: "assistant",
        type: "text",
        content: "Te ayudo con tu compra. Que producto deseas?",
      },
    ],
  } as any;
}
