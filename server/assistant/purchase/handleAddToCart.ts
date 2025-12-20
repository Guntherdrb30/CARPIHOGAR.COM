import * as ProductsSearch from "@/agents/carpihogar-ai-actions/tools/products/searchProducts";
import * as CartAdd from "@/agents/carpihogar-ai-actions/tools/cart/addToCart";

function cleanProductQuery(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u00bf\?\u00a1!\.,;:]/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(
      /\b(agrega|agregar|agregue|agreguen|anade|anadir|poner|pon|mete|meter|quiero|deseo|por|favor|al|a|del|de|la|el|los|las|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|carrito|carro)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuantity(text: string): number {
  const low = text.toLowerCase();
  const digits = low.match(/(\d{1,2})/);
  if (digits) return Math.max(1, parseInt(digits[1], 10));
  const map: Record<string, number> = {
    un: 1,
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
  };
  for (const [k, v] of Object.entries(map)) {
    if (new RegExp(`\\b${k}\\b`).test(low)) return v;
  }
  return 1;
}

export async function handleAddToCart({
  customerId,
  sessionId,
  entities,
  message,
}: {
  customerId?: string;
  sessionId?: string;
  entities?: any;
  message: string;
}) {
  const raw = String(entities?.productName || message || "").trim();
  const cleaned = cleanProductQuery(raw);
  const name = cleaned || raw;
  if (!name) {
    return {
      messages: [{ role: "assistant", type: "text", content: "Que producto deseas agregar?" }],
    };
  }

  let res = await ProductsSearch.run({ q: name });
  if ((!res?.success || !res.data?.length) && cleaned && cleaned !== name) {
    res = await ProductsSearch.run({ q: cleaned });
  }
  if (!res?.success || !res.data?.length) {
    return {
      messages: [
        {
          role: "assistant",
          type: "text",
          content: "No encontre coincidencias exactas. Puedes darme mas detalles o el modelo?",
        },
      ],
    };
  }

  const p = res.data[0];
  const qty = Math.max(1, Number(entities?.quantity || 0) || extractQuantity(raw));
  await CartAdd.run({ customerId, sessionId, productId: p.id, quantity: qty });
  return {
    messages: [
      { role: "assistant", type: "text", content: `Agregado al carrito: ${p.name} x${qty}` },
    ],
    uiActions: [
      { type: "ui_control", action: "add_to_cart_visual", payload: { product: p, quantity: qty } },
    ],
  };
}
