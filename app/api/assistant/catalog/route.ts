import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callOpenAIResponses } from '@/lib/openai';
import { createProduct } from '@/server/actions/products';
import prisma from '@/lib/prisma';

const MAX_PRODUCT_OUTPUT = 8;

const catalogSchema = {
  name: 'catalog_products',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      products: {
        type: 'array',
        maxItems: MAX_PRODUCT_OUTPUT,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            slug: { type: 'string' },
            sku: { type: 'string' },
            code: { type: 'string' },
            brand: { type: 'string' },
            description: { type: 'string' },
            categorySlug: { type: 'string' },
            priceUSD: { type: ['number', 'string'] },
            priceAllyUSD: { type: ['number', 'string'] },
            priceWholesaleUSD: { type: ['number', 'string'] },
            stock: { type: ['number', 'string'] },
            images: {
              type: 'array',
              maxItems: 4,
              items: { type: 'string' },
            },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || `producto-${Math.random().toString(36).slice(2, 6)}`;

const safeNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

async function parseCatalogFromAi(input: string) {
  const resp = await callOpenAIResponses({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    input: [
      {
        role: 'system',
        content:
          'Eres un asistente que convierte la descripción de nuevos productos en JSON estricto. Devuelve únicamente el JSON requerido, sin explicaciones.',
      },
      {
        role: 'user',
        content:
          'Genera hasta 8 productos nuevos para el catálogo de Carpihogar describiendo nombre, marca, descripción corta, tags de categoría y precios. Sé breve y utiliza valores reales si aparecen en el texto.',
      },
      {
        role: 'user',
        content: input,
      },
    ],
    response_format: { type: 'json_schema', json_schema: catalogSchema as any },
  });

  const text =
    (resp as any)?.output?.[0]?.content?.[0]?.text ||
    (resp as any)?.output_text ||
    (resp as any)?.content ||
    '';
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const message = String(body?.message || body?.query || '').trim();
  if (!message) {
    return NextResponse.json(
      { ok: false, error: 'Describe qué productos quieres agregar al catálogo.' },
      { status: 400 },
    );
  }

  const session = await getServerSession(authOptions as any);
  if (!session || String((session.user as any)?.role || '').toUpperCase() !== 'ADMIN') {
    return NextResponse.json({ ok: false, error: 'Solo administradores pueden usar este asistente.' }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'Falta configurar OPENAI_API_KEY.' }, { status: 500 });
  }

  let parsed: any | null = null;
  try {
    parsed = await parseCatalogFromAi(message);
  } catch (error) {
    console.error('Catalog AI parse failed', error);
  }

  if (!parsed || !Array.isArray(parsed.products) || !parsed.products.length) {
    return NextResponse.json({
      ok: false,
      error: 'No logré entender tu descripción. Intenta darme nombre, categoría y precio claros.',
    });
  }

  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const summary = String(parsed.summary || parsed.resumen || '').trim();

  const created: Array<{ id: string; name: string; slug: string }> = [];
  const errors: Array<{ name: string; reason: string }> = [];

  for (const item of parsed.products.slice(0, MAX_PRODUCT_OUTPUT)) {
    const safeName = String(item.name || '').trim();
    if (!safeName) continue;
    const normalizedCategorySlug =
      String(item.categorySlug || body.categorySlug || '').trim().toLowerCase();
    const targetCat = categories.find((cat) => cat.slug === normalizedCategorySlug);

    try {
      const productData = {
        name: safeName,
        slug: String(item.slug || '').trim() || slugify(safeName),
        brand: (item.brand || 'Sin marca').trim(),
        description: String(item.description || '').trim(),
        images: Array.isArray(item.images)
          ? item.images.map((img) => String(img).trim()).filter(Boolean).slice(0, 4)
          : [],
        sku: String(item.sku || '').trim() || undefined,
        code: String(item.code || '').trim() || undefined,
        priceUSD: safeNumber(item.priceUSD) ?? safeNumber(item.priceAllyUSD) ?? 0,
        priceAllyUSD: safeNumber(item.priceAllyUSD),
        priceWholesaleUSD: safeNumber(item.priceWholesaleUSD),
        stock: Number.isFinite(Number(item.stock)) ? Number(item.stock) : 0,
        categoryId: targetCat?.id ?? null,
      };

      const createdProduct = await createProduct(productData as any);
      created.push({ id: createdProduct.id, name: createdProduct.name, slug: createdProduct.slug });
    } catch (error: any) {
      console.error('Catalog product creation failed', error);
      errors.push({
        name: safeName,
        reason: String(error?.message || 'No se pudo crear el producto'),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    summary: summary || 'Productos generados con IA',
    created,
    errors,
  });
}
