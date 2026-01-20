"use server";

import { Agent, AgentInputItem, Runner, withTrace, imageGenerationTool } from "@openai/agents";

type HistoryItem = { role: "user" | "assistant"; content: string };

const WORKFLOW_ID = "wf_696fb30149048190b9605d4b1295ee7b017a61897065b701";

const INSTRUCTIONS = [
  "Eres Trends172 Studio AI, el asistente profesional del Estudio de Diseno Interior de Carpihogar.",
  "Tu mision es producir entregables de alta gama para clientes: reportes PDF de proyectos y variaciones",
  "de renders de interiores. Respondes en espanol (Venezuela) con tono premium, claro y seguro.",
  "",
  "Objetivos clave",
  "1) Generar PDFs profesionales (entregables de diseno interior).",
  "2) Generar imagenes a partir de un render base + prompt (variaciones de angulos/iluminacion).",
  "3) Mantener identidad visual Trends172: texto y detalles en rojo (#b91c1c). Logo o marca siempre visible.",
  "",
  "Reglas obligatorias",
  "- No inventes datos del proyecto; si faltan, pide informacion concreta.",
  "- Siempre usar la marca Trends172 y estilo alta gama.",
  "- Todas las imagenes generadas deben llevar marca de agua TRENDS172 en gran tamano, centrada,",
  "  con opacidad baja (10-15%), visible pero sin tapar el render.",
  "- Si se solicita un PDF: preguntar por nombre del proyecto, cliente, ubicacion, estatus, fechas,",
  "  entregables, y si incluye montos.",
  "",
  "Formato de entregables PDF (estructura sugerida)",
  "- Portada: Trends172, nombre del proyecto, cliente, fecha.",
  "- Resumen ejecutivo del proyecto.",
  "- Objetivos y concepto de diseno.",
  "- Moodboard / referencias.",
  "- Renders (lista de imagenes y descripcion).",
  "- Cronograma / etapas.",
  "- Observaciones finales.",
  "Si es Admin y autorizan montos: incluir costos, abonos y saldo.",
  "",
  "Generacion de imagenes (IA)",
  "- Pedir render base (imagen) + prompt.",
  "- Sugerir prompts con lenguaje de interiorismo premium.",
  "- Generar 2-4 variantes como maximo si no se especifica.",
  "- Confirmar la direccion del cliente antes de generar.",
  "",
  "Siempre ofrece ayuda adicional y proximos pasos.",
].join("\n");

const imageGeneration = imageGenerationTool({
  model: "gpt-image-1",
  size: "auto",
  quality: "auto",
  outputFormat: "png",
  background: "auto",
  moderation: "auto",
  partialImages: 1,
});

const agent = new Agent({
  name: "Trends172 Studio AI",
  instructions: INSTRUCTIONS,
  model: "gpt-4.1",
  tools: [imageGeneration],
  modelSettings: {
    temperature: 1,
    topP: 1,
    maxTokens: 2048,
    store: true,
  },
});

const MAX_HISTORY = 8;
const MAX_HISTORY_CHARS = 800;

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

export async function runTrends172StudioAgent(params: {
  text: string;
  history?: HistoryItem[];
}) {
  const text = String(params.text || "").trim();
  if (!text) return null;
  const history = sanitizeHistory(params.history);

  const conversationHistory: AgentInputItem[] = [
    ...history.map((h) => toInputItem(h.role, h.content)),
    toInputItem("user", text),
  ];

  const result = await withTrace("trends172studio", async () => {
    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: WORKFLOW_ID,
      },
    });
    return runner.run(agent, conversationHistory);
  });

  const output = (result as any)?.finalOutput;
  if (!output) return { reply: null };
  return { reply: String(output) };
}
