import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callOpenAIResponses } from '@/lib/openai';
import { getSettings } from '@/server/actions/settings';
import { z } from 'zod';

const catalogSchema = {
  name: 'carpihogar_catalog',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      coverTitle: { type: 'string' },
      coverSubtitle: { type: 'string' },
      coverDescription: { type: 'string' },
      sections: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            text: { type: 'string' },
            highlight: { type: 'string' },
          },
          required: ['title', 'text'],
          additionalProperties: false,
        },
      },
      featuredProducts: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            note: { type: 'string' },
            priceLabel: { type: 'string' },
            priceValue: { type: 'string' },
            stock: { type: 'string' },
          },
          required: ['name', 'priceLabel', 'priceValue'],
          additionalProperties: false,
        },
      },
      catalogHtml: { type: 'string' },
    },
    required: ['summary', 'coverTitle', 'catalogHtml'],
    additionalProperties: false,
  },
};

const incomingProductSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().optional(),
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  priceUSD: z.number().optional().nullable(),
  priceAllyUSD: z.number().optional().nullable(),
  priceWholesaleUSD: z.number().optional().nullable(),
  stock: z.number().optional().nullable(),
  sku: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
});

const payloadSchema = z.object({
  products: z.array(incomingProductSchema).min(1).max(40),
  filters: z.object({
    category: z.string().optional().nullable(),
    priceTypes: z.array(z.string()).min(1),
    currency: z.enum(['USD', 'VES']),
    sortBy: z.string().optional(),
    sortDir: z.string().optional(),
  }).optional(),
  metadata: z.object({
    brandName: z.string().optional(),
    logoUrl: z.string().url().optional(),
    contactLine: z.string().optional(),
  }).optional(),
});

function renderProductSummary(product: z.infer<typeof incomingProductSchema>) {
  const label = product.code || product.sku || 'Código sin asignar';
  const value = product.priceUSD ?? product.priceAllyUSD ?? product.priceWholesaleUSD ?? 0;
  const priceText = value ? `$${value.toFixed(2)}` : 'Precio bajo solicitud';
  return `${product.name} (${label}) — ${priceText}`;
}

async function parseAiResponse(resp: any) {
  const text =
    resp?.output?.[0]?.content?.[0]?.text || resp?.output_text || resp?.content || '';
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session || ((session.user as any)?.role || '').toUpperCase() !== 'ADMIN') {
    return NextResponse.json({ error: 'Solo administradores pueden generar catálogos.' }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Falta configurar OPENAI_API_KEY.' }, { status: 500 });
  }

  const rawBody = await request.json().catch(() => null);
  if (!rawBody) {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  let parsedBody: z.infer<typeof payloadSchema>;
  try {
    parsedBody = payloadSchema.parse(rawBody);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Datos inválidos.' }, { status: 400 });
  }

  const settings = await getSettings();
  const brandName = parsedBody.metadata?.brandName || settings?.brandName || 'Carpihogar';
  const contactLine = parsedBody.metadata?.contactLine || '';
  const categorySlug = parsedBody.filters?.category || 'Todas las categorías';
  const priceTypes = parsedBody.filters?.priceTypes || ['client'];
  const currency = (parsedBody.filters?.currency || 'USD') as 'USD' | 'VES';

  const productLines = parsedBody.products.map((product) => renderProductSummary(product)).join('\n');

  const priceLabels = priceTypes
    .map((type) => {
      if (type.toLowerCase().includes('ally')) return 'Precio Aliado';
      if (type.toLowerCase().includes('wholesale')) return 'Precio Mayorista';
      if (type.toLowerCase().includes('client')) return 'Precio Cliente';
      return `Precio ${type}`;
    })
    .join(', ');

  const promptLines = [
    `Marca: ${brandName}`,
    `Filtros aplicados: Categoría=${categorySlug}, Precios=${priceLabels}, Moneda=${currency}`,
    `Linea de contacto: ${contactLine}`,
    'Productos:',
    productLines,
  ].join('\n');

  try {
    const resp = await callOpenAIResponses({
      model: 'gpt-4o-mini',
      temperature: 0.15,
      input: [
        {
          role: 'system',
          content:
            'Eres un generador creativo de catálogos premium para Carpihogar. Devuelve únicamente el JSON solicitado sin explicaciones adicionales. Incluye una portada impactante, secciones temáticas y una tabla HTML elegante que el cliente pueda descargar para imprimir.',
        },
        {
          role: 'user',
          content: `Genera un catálogo completo usando los datos. El estilo debe ser moderno, elegante y premium. La portada mencionará el logo en ${parsedBody.metadata?.logoUrl || 'logo oficial'} y el eslogan "Carpintería y Hogar". Incluye tres secciones (destacados, tendencias, remates) con resumen y al menos seis productos destacados y una tabla HTML.`,
        },
        {
          role: 'user',
          content: promptLines,
        },
      ],
      response_format: { type: 'json_schema', json_schema: catalogSchema as any },
    });

    const parsed = await parseAiResponse(resp);
    if (!parsed || !parsed.catalogHtml) {
      throw new Error('La IA no retornó un catálogo válido.');
    }

    return NextResponse.json({
      ok: true,
      catalog: parsed,
      filters: {
        category: categorySlug,
        priceTypes,
        currency,
      },
    });
  } catch (error: any) {
    console.error('AI catalog generation failed', error);
    return NextResponse.json({
      error: error?.message || 'No se pudo generar el catálogo.',
    }, { status: 500 });
  }
}
