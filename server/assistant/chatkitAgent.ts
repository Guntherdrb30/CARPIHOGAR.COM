import { Agent, AgentInputItem, Runner, tool, withTrace } from "@openai/agents";
import { z } from "zod";
import * as ProductsSearch from "@/agents/carpihogar-ai-actions/tools/products/searchProducts";
import * as ProductsGet from "@/agents/carpihogar-ai-actions/tools/products/getProduct";
import * as CartAdd from "@/agents/carpihogar-ai-actions/tools/cart/addToCart";
import * as CartRemove from "@/agents/carpihogar-ai-actions/tools/cart/removeFromCart";
import * as CartUpdateQty from "@/agents/carpihogar-ai-actions/tools/cart/updateQty";
import * as CartView from "@/agents/carpihogar-ai-actions/tools/cart/viewCart";
import * as CartClear from "@/agents/carpihogar-ai-actions/tools/cart/clearCart";
import * as CustomerGetProfile from "@/agents/carpihogar-ai-actions/tools/customer/getProfile";
import * as CustomerListAddresses from "@/agents/carpihogar-ai-actions/tools/customer/listAddresses";
import * as ShippingGetOptions from "@/agents/carpihogar-ai-actions/tools/shipping/getShippingOptions";
import * as ShippingEstimateETA from "@/agents/carpihogar-ai-actions/tools/shipping/estimateETA";

type HistoryItem = { role: "user" | "assistant"; content: string };
type ToolEffects = { products?: any[]; cart?: any; cartChanged?: boolean };
type AgentContext = {
  customerId?: string;
  sessionId?: string;
  effects: ToolEffects;
};

const WORKFLOW_ID =
  "wf_696eba1ff1ec8190bb1dfc4f0f99564d01d3832e77990960";

const INSTRUCTIONS = [
  "Eres el agente de ventas de Carpihogar, especialista en cierre.",
  "Tu mision es asesorar compras de articulos de decoracion y mobiliario,",
  "recomendar opciones segun estilo/uso/presupuesto y ayudar a armar el carrito.",
  "Responde en espanol (Venezuela), tono amable, breve, persuasivo y orientado a compra.",
  "No inventes precios ni stock: usa la base de datos y herramientas disponibles,",
  "y si no hay datos, dilo y ofrece alternativas.",
  "No trates temas fuera de Carpihogar ni menciones secciones del sitio (novedades, contacto, etc.).",
  "",
  "Guia de asesoramiento:",
  "- Si el producto NO es herramienta: explica usos y beneficios (ej. revestimientos, herrajes, accesorios decorativos).",
  "- Si el producto ES herramienta: solo muestra ficha y precio, sin asesorar usos.",
  "- Haz 1-2 preguntas de aclaracion cuando falten datos clave",
  "  (ambiente, medidas, estilo, color, presupuesto).",
  "- Ofrece 3-5 opciones con nombre, precio y por que encajan.",
  "- Empuja el cierre: confirma preferencia, ofrece agregar al carrito y guia al checkout.",
  "- Escala a humano si la consulta es reclamo fuerte, garantia o datos sensibles.",
  "",
  "Herramientas disponibles (usa cuando necesites datos reales):",
  "- products_search(query)",
  "- products_get(id | slug)",
  "- cart_add(productId, quantity)",
  "- cart_remove(productId)",
  "- cart_update_qty(productId, quantity)",
  "- cart_view()",
  "- cart_clear()",
  "- customer_get_profile()",
  "- customer_list_addresses()",
  "- shipping_get_options(city)",
  "- shipping_estimate_eta(city, date)",
  "",
  "Politica de ayuda:",
  "- Ofrece agregar al carrito o ajustar cantidades.",
  "- Si el usuario quiere pagar, guia al checkout y al metodo de pago disponible.",
].join("\n");

const productsSearchTool = tool({
  name: "products_search",
  description: "Busca productos en el catalogo por palabras clave.",
  parameters: z.object({
    query: z.string().min(2),
  }),
  execute: async (input, runContext) => {
    const res = await ProductsSearch.run({ q: input.query });
    const ctx = runContext.context as AgentContext;
    if (res?.success && Array.isArray(res.data)) {
      ctx.effects.products = res.data;
    }
    return res;
  },
});

const productsGetTool = tool({
  name: "products_get",
  description: "Obtiene el detalle de un producto por id o slug.",
  parameters: z
    .object({
      id: z.string().optional(),
      slug: z.string().optional(),
    })
    .refine((data) => Boolean(data.id || data.slug), {
      message: "Debes indicar id o slug",
    }),
  execute: async (input) => {
    return ProductsGet.run({ id: input.id, slug: input.slug });
  },
});

const cartAddTool = tool({
  name: "cart_add",
  description: "Agrega un producto al carrito del asistente.",
  parameters: z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive().optional(),
  }),
  execute: async (input, runContext) => {
    const ctx = runContext.context as AgentContext;
    const res = await CartAdd.run({
      customerId: ctx.customerId,
      sessionId: ctx.sessionId,
      productId: input.productId,
      quantity: input.quantity ?? 1,
    });
    if (res?.success) ctx.effects.cartChanged = true;
    return res;
  },
});

const cartRemoveTool = tool({
  name: "cart_remove",
  description: "Elimina un producto del carrito del asistente.",
  parameters: z.object({
    productId: z.string().min(1),
  }),
  execute: async (input, runContext) => {
    const ctx = runContext.context as AgentContext;
    const res = await CartRemove.run({
      customerId: ctx.customerId,
      sessionId: ctx.sessionId,
      productId: input.productId,
    });
    if (res?.success) ctx.effects.cartChanged = true;
    return res;
  },
});

const cartUpdateQtyTool = tool({
  name: "cart_update_qty",
  description: "Actualiza cantidad de un producto en el carrito del asistente.",
  parameters: z.object({
    productId: z.string().min(1),
    quantity: z.number().int(),
  }),
  execute: async (input, runContext) => {
    const ctx = runContext.context as AgentContext;
    const res = await CartUpdateQty.run({
      customerId: ctx.customerId,
      sessionId: ctx.sessionId,
      productId: input.productId,
      quantity: input.quantity,
    });
    if (res?.success) ctx.effects.cartChanged = true;
    return res;
  },
});

const cartViewTool = tool({
  name: "cart_view",
  description: "Obtiene el carrito actual del asistente.",
  parameters: z.object({}),
  execute: async (_input, runContext) => {
    const ctx = runContext.context as AgentContext;
    const res = await CartView.run({
      customerId: ctx.customerId,
      sessionId: ctx.sessionId,
    });
    if (res?.success) ctx.effects.cart = res.data || null;
    return res;
  },
});

const cartClearTool = tool({
  name: "cart_clear",
  description: "Vacia el carrito del asistente.",
  parameters: z.object({}),
  execute: async (_input, runContext) => {
    const ctx = runContext.context as AgentContext;
    const res = await CartClear.run({
      customerId: ctx.customerId,
      sessionId: ctx.sessionId,
    });
    if (res?.success) ctx.effects.cartChanged = true;
    return res;
  },
});

const customerGetProfileTool = tool({
  name: "customer_get_profile",
  description: "Obtiene el perfil del cliente actual (requiere sesion).",
  parameters: z.object({}),
  execute: async (_input, runContext) => {
    const ctx = runContext.context as AgentContext;
    if (!ctx.customerId) {
      return { success: false, message: "Necesito iniciar sesion", data: null };
    }
    return CustomerGetProfile.run({ userId: ctx.customerId });
  },
});

const customerListAddressesTool = tool({
  name: "customer_list_addresses",
  description: "Lista direcciones del cliente actual (requiere sesion).",
  parameters: z.object({}),
  execute: async (_input, runContext) => {
    const ctx = runContext.context as AgentContext;
    if (!ctx.customerId) {
      return { success: false, message: "Necesito iniciar sesion", data: [] };
    }
    return CustomerListAddresses.run({ userId: ctx.customerId });
  },
});

const shippingGetOptionsTool = tool({
  name: "shipping_get_options",
  description: "Obtiene opciones de envio segun ciudad.",
  parameters: z.object({
    city: z.string().min(2),
  }),
  execute: async (input) => {
    return ShippingGetOptions.run({ city: input.city });
  },
});

const shippingEstimateEtaTool = tool({
  name: "shipping_estimate_eta",
  description: "Calcula un ETA estimado segun ciudad.",
  parameters: z.object({
    city: z.string().optional(),
    date: z.string().optional(),
  }),
  execute: async (input) => {
    return ShippingEstimateETA.run({ city: input.city, date: input.date });
  },
});

const agent = new Agent({
  name: "carpihogar ventas",
  instructions: INSTRUCTIONS,
  model: "gpt-4.1",
  modelSettings: {
    temperature: 1,
    topP: 1,
    maxTokens: 2048,
    store: true,
  },
  tools: [
    productsSearchTool,
    productsGetTool,
    cartAddTool,
    cartRemoveTool,
    cartUpdateQtyTool,
    cartViewTool,
    cartClearTool,
    customerGetProfileTool,
    customerListAddressesTool,
    shippingGetOptionsTool,
    shippingEstimateEtaTool,
  ],
});

const MAX_HISTORY = 8;
const MAX_HISTORY_CHARS = 600;

function toInputItem(role: "user" | "assistant", text: string): AgentInputItem {
  return {
    role,
    content: [{ type: "input_text", text }],
  } as AgentInputItem;
}

function sanitizeHistory(history: HistoryItem[] | undefined) {
  const items = Array.isArray(history) ? history : [];
  return items
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => {
      const content = String(item.content || "").trim();
      if (!content) return null;
      const clipped =
        content.length > MAX_HISTORY_CHARS
          ? content.slice(0, MAX_HISTORY_CHARS) + "..."
          : content;
      return { role: item.role, content: clipped };
    })
    .filter(Boolean)
    .slice(-MAX_HISTORY) as HistoryItem[];
}

export async function runChatkitAgent(params: {
  text: string;
  history?: HistoryItem[];
  productsSummary?: any[] | null;
  customerId?: string;
  sessionId?: string;
}) {
  const text = String(params.text || "").trim();
  if (!text) return null;
  const history = sanitizeHistory(params.history);
  const effects: ToolEffects = {};
  const summary =
    params.productsSummary && params.productsSummary.length
      ? `\n\nContexto interno (resultados de catalogo JSON): ${JSON.stringify(
          params.productsSummary,
        )}`
      : "";
  const userText = `${text}${summary}`;

  const conversationHistory: AgentInputItem[] = [
    ...history.map((h) => toInputItem(h.role, h.content)),
    toInputItem("user", userText),
  ];

  const result = await withTrace("carpihogarventas", async () => {
    const context: AgentContext = {
      customerId: params.customerId,
      sessionId: params.sessionId,
      effects,
    };
    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: WORKFLOW_ID,
      },
    });
    return runner.run(agent, conversationHistory, { context });
  });

  const output = (result as any)?.finalOutput;
  if (!output) return { reply: null, effects };
  return { reply: String(output), effects };
}
