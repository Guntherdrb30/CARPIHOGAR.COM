import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callOpenAIResponses } from '@/lib/openai';
import { getSettings } from '@/server/actions/settings';
import prisma from '@/lib/prisma';
import { normalizeCatalogImageUrl } from '@/lib/catalog-image';
import { PRICE_TYPE_META } from '@/lib/catalog-report';
import { z } from 'zod';

// NOTE: We only ask AI for marketing copy. The HTML catalog is generated deterministically
// using the real product data (images/prices/stock) to avoid hallucinations.
const catalogCopySchema = {
  name: 'carpihogar_catalog_copy',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      coverTitle: { type: 'string' },
      coverSubtitle: { type: 'string' },
      coverDescription: { type: 'string' },
      sections: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            text: { type: 'string' },
            highlight: { type: 'string' },
          },
          // OpenAI Structured Outputs requires `required` to include every key in `properties`.
          required: ['title', 'text', 'highlight'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'coverTitle', 'coverSubtitle', 'coverDescription', 'sections'],
    additionalProperties: false,
  },
};

const numericString = z.preprocess((value) => {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}, z.number().nullable());

const incomingProductSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().optional(),
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  priceUSD: numericString.optional(),
  priceAllyUSD: numericString.optional(),
  priceWholesaleUSD: numericString.optional(),
  stock: numericString.optional(),
  sku: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
});

const payloadSchema = z.object({
  // The HTML renderer can handle more products; AI prompt uses only a short slice.
  products: z.array(incomingProductSchema).min(1).max(500),
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

const formatPrice = (value: number | null | undefined) => {
  if (value == null) return null;
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
};

const escapeHtml = (value: any) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

function buildContactLine(settings: any) {
  const parts = [
    settings?.brandName,
    settings?.contactEmail,
    settings?.contactPhone,
    settings?.instagramHandle ? `@${String(settings.instagramHandle).replace(/^@/, '')}` : null,
    settings?.legalCompanyAddress,
  ].filter(Boolean);
  return parts.join(' · ');
}

function renderProductSummary(product: z.infer<typeof incomingProductSchema>) {
  const label = product.code || product.sku || 'Código sin asignar';
  const value = formatPrice(product.priceUSD ?? product.priceAllyUSD ?? product.priceWholesaleUSD ?? null);
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

function buildCatalogHtml({
  origin,
  brandName,
  logoUrl,
  contactLine,
  printedAt,
  categoryLabel,
  currency,
  exchangeRate,
  priceTypes,
  sortLabel,
  copy,
  products,
}: {
  origin: string;
  brandName: string;
  logoUrl: string;
  contactLine: string;
  printedAt: string;
  categoryLabel: string;
  currency: 'USD' | 'VES';
  exchangeRate: number;
  priceTypes: string[];
  sortLabel: string;
  copy: {
    summary: string;
    coverTitle: string;
    coverSubtitle: string;
    coverDescription: string;
    sections: Array<{ title: string; text: string; highlight: string }>;
  };
  products: Array<{
    id?: string;
    name: string;
    code?: string | null;
    sku?: string | null;
    image?: string | null;
    stock?: number | null;
    prices: Array<{ label: string; value: string }>;
  }>;
}) {
  const perPage = 24; // 4 columns x 6 rows
  const rawPages = chunk(products, perPage);
  const pages = rawPages.length ? rawPages : [[]];
  // Print only product pages (4x6). This keeps the catalog compact.
  const totalPages = Math.max(1, pages.length);
  const safeBrandName = escapeHtml(brandName);
  const safeCategory = escapeHtml(categoryLabel);
  const safePrintedAt = escapeHtml(printedAt);
  const safeContact = escapeHtml(contactLine);
  const safeSort = escapeHtml(sortLabel);
  const safeCurrency = escapeHtml(currency);
  const safeRate =
    currency === 'VES' ? ` - Tasa: ${escapeHtml(Number(exchangeRate || 0).toFixed(2))} Bs/USD` : '';
  const priceLabelSummary = priceTypes
    .map((type) => (PRICE_TYPE_META as any)[type]?.label || type)
    .filter(Boolean)
    .join(', ');

  const productPagesHtml = pages
    .map((pageProducts, idx) => {
      const pageNumber = idx + 1;
      const cards = pageProducts
        .map((p) => {
          const label = p.code || p.sku || 'SIN CODIGO';
          const stockText =
            typeof p.stock === 'number' && Number.isFinite(p.stock)
              ? `${p.stock}`
              : '-';
          const imgUrl = p.image ? escapeHtml(p.image) : '';
          const priceLines = p.prices
            .map(
              (line) =>
                `<div class="price"><span class="price__label">${escapeHtml(line.label)}</span><span class="price__value">${escapeHtml(line.value)}</span></div>`,
            )
            .join('');
          return `
            <article class="card">
              <div class="card__media">
                ${imgUrl ? `<img class="card__img" src="${imgUrl}" alt="${escapeHtml(p.name)}" />` : `<div class="card__img card__img--empty">Sin imagen</div>`}
                <div class="card__code">${escapeHtml(label)}</div>
              </div>
              <div class="card__body">
                <div class="card__name">${escapeHtml(p.name)}</div>
                <div class="card__prices">${priceLines}</div>
                <div class="card__stock">Stock: <strong>${escapeHtml(stockText)}</strong></div>
              </div>
            </article>
          `;
        })
        .join('');

      return `
        <section class="page page--products">
          <header class="page__header page__header--compact">
            <div class="header__left">
              <div class="header__title">${safeBrandName}</div>
              <div class="header__sub">${safeCategory} · ${escapeHtml(priceLabelSummary)} · ${safeCurrency}${safeRate}</div>
            </div>
            <div class="header__right">
              <div class="header__sort">Orden: ${safeSort}</div>
            </div>
          </header>

          <div class="grid">
            ${cards}
          </div>

          <footer class="page__footer">
            <div class="footer__left">
              <img class="footer__logo" src="${escapeHtml(logoUrl)}" alt="${safeBrandName}" />
              <span class="footer__date">${safePrintedAt}</span>
            </div>
            <div class="footer__center">${safeContact}</div>
            <div class="footer__right">Pagina ${pageNumber} / ${totalPages}</div>
          </footer>
        </section>
      `;
    })
    .join('');

  const faviconUrl = `${origin}/favicon.ico`;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeBrandName} · Catalogo</title>
    <link rel="icon" href="${escapeHtml(faviconUrl)}" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      :root{
        --bg: #0b1020;
        --paper: #ffffff;
        --ink: #0f172a;
        --muted: #475569;
        --line: rgba(15, 23, 42, 0.12);
        --brand: #e11d2e;
        --brand2: #0ea5e9;
        --shadow: 0 14px 40px rgba(2, 6, 23, 0.25);
        --radius: 16px;
        --gap: 10px;
      }
      *{ box-sizing: border-box; }
      body{
        margin: 0;
        background: radial-gradient(900px 520px at 12% 12%, rgba(225,29,46,0.20), transparent 60%),
                    radial-gradient(900px 520px at 88% 28%, rgba(14,165,233,0.18), transparent 60%),
                    var(--bg);
        color: var(--ink);
        font-family: "Plus Jakarta Sans", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      .page{
        width: 210mm;
        min-height: 297mm;
        margin: 18px auto;
        background: var(--paper);
        border-radius: 22px;
        overflow: hidden;
        box-shadow: 0 14px 40px rgba(2, 6, 23, 0.25);
        position: relative;
        padding: 18mm 14mm 16mm;
      }
      .page__header{
        display:flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
      }
      .page__header--compact{ align-items:center; }
      .brand{ display:flex; gap: 12px; align-items:center; }
      .brand__logo{ width: 52px; height: 52px; object-fit: contain; border-radius: 12px; background: #fff; border: 1px solid var(--line); padding: 8px; }
      .brand__name{ font-weight: 800; letter-spacing: 0.02em; }
      .brand__tag{ margin-top: 2px; font-size: 10px; letter-spacing: 0.28em; color: var(--muted); text-transform: uppercase; }
      .meta{ min-width: 280px; border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 12px; background: linear-gradient(180deg, rgba(14,165,233,0.08), rgba(225,29,46,0.06)); }
      .meta__row{ display:flex; justify-content: space-between; gap: 10px; font-size: 12px; color: var(--muted); }
      .meta__row strong{ color: var(--ink); }

      .cover{ margin-top: 16px; padding: 18px; border-radius: var(--radius); border: 1px solid var(--line); background:
        radial-gradient(560px 220px at 22% 20%, rgba(225,29,46,0.18), transparent 65%),
        radial-gradient(560px 220px at 80% 52%, rgba(14,165,233,0.16), transparent 65%),
        #ffffff;
      }
      .cover__title{ margin: 0; font-size: 34px; line-height: 1.05; letter-spacing: -0.02em; }
      .cover__subtitle{ margin-top: 8px; color: var(--brand); font-weight: 800; letter-spacing: 0.18em; font-size: 11px; text-transform: uppercase; }
      .cover__desc{ margin-top: 10px; max-width: 90%; color: var(--muted); font-size: 14px; line-height: 1.55; }
      .cover__summary{ margin-top: 14px; font-weight: 600; color: #0b1226; }

      .sections{
        margin-top: 14px;
        display:grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
      }
      .section{
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 12px 12px;
        background: #ffffff;
      }
      .section__kicker{ font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--muted); }
      .section__title{ margin: 8px 0 6px; font-size: 14px; }
      .section__text{ margin: 0; color: var(--muted); font-size: 12px; line-height: 1.55; }

      .header__title{ font-weight: 800; letter-spacing: 0.02em; }
      .header__sub{ font-size: 12px; color: var(--muted); margin-top: 2px; }
      .header__sort{ font-size: 12px; color: var(--muted); text-align: right; }

      .grid{
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--gap);
        height: calc(297mm - 18mm - 16mm - 32mm - 18mm);
        grid-template-rows: repeat(6, 1fr);
      }
      .card{
        border: 1px solid var(--line);
        border-radius: 14px;
        overflow: hidden;
        background: #ffffff;
        display:flex;
        flex-direction: column;
        min-height: 0;
      }
      .card__media{ position: relative; height: 46%; background: #f1f5f9; }
      .card__img{ width: 100%; height: 100%; object-fit: cover; display:block; }
      .card__img--empty{ display:flex; align-items:center; justify-content:center; color: #94a3b8; font-size: 11px; }
      .card__code{
        position:absolute; left: 8px; bottom: 8px;
        background: rgba(15,23,42,0.78);
        color: #fff;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        padding: 6px 8px;
        border-radius: 999px;
        max-width: calc(100% - 16px);
        white-space: nowrap;
        overflow:hidden;
        text-overflow: ellipsis;
        backdrop-filter: blur(6px);
      }
      .card__body{ padding: 10px 10px; display:flex; flex-direction: column; gap: 6px; min-height: 0; }
      .card__name{
        font-weight: 700;
        font-size: 11px;
        line-height: 1.25;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }
      .card__prices{ display:flex; flex-direction: column; gap: 4px; }
      .price{ display:flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--muted); }
      .price__value{ font-weight: 800; color: var(--ink); }
      .card__stock{ margin-top: auto; font-size: 11px; color: var(--muted); }
      .page__footer{
        position:absolute;
        left: 14mm;
        right: 14mm;
        bottom: 10mm;
        display:flex;
        gap: 10px;
        align-items:center;
        justify-content: space-between;
        color: var(--muted);
        font-size: 11px;
      }
      .footer__left{ display:flex; gap: 10px; align-items:center; min-width: 220px; }
      .footer__logo{ width: 26px; height: 26px; object-fit: contain; }
      .footer__center{
        flex: 1;
        text-align:center;
        white-space: nowrap;
        overflow:hidden;
        text-overflow: ellipsis;
      }
      .footer__right{ min-width: 140px; text-align:right; }

      @media print{
        body{ background: #fff; }
        .page{ margin: 0; border-radius: 0; box-shadow: none; page-break-after: always; }
        .page:last-child{ page-break-after: auto; }
      }
    </style>
  </head>
  <body>
    ${productPagesHtml}
  </body>
</html>`;
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
  const contactLine = buildContactLine(settings);
  const categorySlug = parsedBody.filters?.category || 'Todas las categorías';
  const priceTypes = parsedBody.filters?.priceTypes || ['client'];
  const currency = (parsedBody.filters?.currency || 'USD') as 'USD' | 'VES';

  const sortBy = String(parsedBody.filters?.sortBy || 'name');
  const sortDir = String(parsedBody.filters?.sortDir || 'asc');
  const sortLabel = `${sortBy} (${sortDir})`;
  const exchangeRate = (() => {
    const rate = Number(settings?.tasaVES ?? 0);
    return rate > 0 ? rate : 1;
  })();
  const origin = new URL(request.url).origin;
  const logoUrl =
    (settings?.logoUrl ? normalizeCatalogImageUrl(settings.logoUrl, { origin }) : null) ||
    `${origin}/logo-catalogo.svg`;
  const printedAt = new Date().toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' });

  // Use only a small slice for the AI prompt to keep token usage stable.
  const productLines = parsedBody.products
    .slice(0, 40)
    .map((product) => renderProductSummary(product))
    .join('\n');

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

  const incomingIds = parsedBody.products
    .map((p) => String(p.id || '').trim())
    .filter(Boolean);
  const dbProducts = incomingIds.length
    ? await prisma.product.findMany({
        where: { id: { in: incomingIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          brand: true,
          code: true,
          sku: true,
          stock: true,
          priceUSD: true,
          priceAllyUSD: true,
          priceWholesaleUSD: true,
          images: true,
        },
      })
    : [];
  const byId = new Map(dbProducts.map((p) => [p.id, p]));

  const money = new Intl.NumberFormat('es-VE', { style: 'currency', currency });
  const convert = (value: number) => (currency === 'VES' ? value * exchangeRate : value);
  const resolvePriceLines = (p: any) => {
    const lines: Array<{ label: string; value: string }> = [];
    const selected = priceTypes.length ? priceTypes : ['client'];
    for (const type of selected) {
      const meta = (PRICE_TYPE_META as any)[type] || null;
      const label = meta?.label || type;
      const field =
        meta?.field ||
        (type === 'ally'
          ? 'priceAllyUSD'
          : type === 'wholesale'
          ? 'priceWholesaleUSD'
          : 'priceUSD');
      const raw = p?.[field];
      const num = raw == null ? null : Number(raw);
      if (num != null && Number.isFinite(num) && num > 0) {
        lines.push({ label, value: money.format(convert(num)) });
      }
    }
    if (!lines.length) {
      const fallback = Number(p?.priceUSD ?? 0);
      if (Number.isFinite(fallback) && fallback > 0) {
        lines.push({ label: 'Cliente', value: money.format(convert(fallback)) });
      } else {
        lines.push({ label: 'Precio', value: 'Bajo solicitud' });
      }
    }
    return lines;
  };

  const resolvedProducts = parsedBody.products.map((incoming) => {
    const id = incoming.id ? String(incoming.id) : undefined;
    const db = id ? byId.get(id) : undefined;
    const name = String(db?.name || incoming.name || '').trim();
    const code = (db?.code ?? incoming.code ?? null) as any;
    const sku = (db?.sku ?? incoming.sku ?? null) as any;
    const stock =
      db?.stock != null && Number.isFinite(Number(db.stock))
        ? Number(db.stock)
        : incoming.stock != null && Number.isFinite(Number(incoming.stock))
        ? Number(incoming.stock)
        : null;
    const imageCandidate =
      (Array.isArray(db?.images) && db!.images[0] ? db!.images[0] : null) ||
      incoming.image ||
      null;
    const image = imageCandidate
      ? normalizeCatalogImageUrl(String(imageCandidate), { origin })
      : null;
    const prices = resolvePriceLines(db || incoming);
    return { id, name, code, sku, image, stock, prices };
  });

  try {
    const resp = await callOpenAIResponses({
      model: 'gpt-4o-mini',
      temperature: 0.15,
      input: [
        {
          role: 'system',
          content:
            'Eres un redactor creativo de catálogos premium para Carpihogar. Devuelve únicamente el JSON solicitado sin explicaciones adicionales. Redacta de forma moderna, elegante y comercial.',
        },
        {
          role: 'user',
          content:
            'Redacta el copy para un catálogo premium. Incluye portada impactante y exactamente 3 secciones (destacados, tendencias, remates). No inventes datos de productos.',
        },
        {
          role: 'user',
          content: promptLines,
        },
      ],
      response_format: { type: 'json_schema', json_schema: catalogCopySchema as any },
    });

    const parsed = await parseAiResponse(resp);
    const copy =
      parsed && typeof parsed === 'object'
        ? {
            summary: String((parsed as any).summary || '').trim(),
            coverTitle: String((parsed as any).coverTitle || '').trim(),
            coverSubtitle: String((parsed as any).coverSubtitle || '').trim(),
            coverDescription: String((parsed as any).coverDescription || '').trim(),
            sections: Array.isArray((parsed as any).sections) ? (parsed as any).sections : [],
          }
        : null;

    const fallbackCopy = {
      summary: `Selección actual de productos en ${brandName}.`,
      coverTitle: `Catálogo premium de ${brandName}`,
      coverSubtitle: 'CARPINTERIA Y HOGAR',
      coverDescription: `Explora nuestra selección en ${categorySlug}.`,
      sections: [
        { title: 'Destacados', text: 'Una selección curada con lo más buscado por nuestros clientes.', highlight: 'Lo más vendido' },
        { title: 'Tendencias', text: 'Nuevas llegadas y piezas que elevan cualquier proyecto.', highlight: 'Novedades' },
        { title: 'Remates', text: 'Oportunidades para comprar inteligente sin sacrificar calidad.', highlight: 'Oferta' },
      ],
    };

    const finalCopy = {
      summary: copy?.summary || fallbackCopy.summary,
      coverTitle: copy?.coverTitle || fallbackCopy.coverTitle,
      coverSubtitle: copy?.coverSubtitle || fallbackCopy.coverSubtitle,
      coverDescription: copy?.coverDescription || fallbackCopy.coverDescription,
      sections: (copy?.sections?.length === 3 ? copy.sections : fallbackCopy.sections).map((s: any) => ({
        title: String(s?.title || '').trim() || 'Sección',
        text: String(s?.text || '').trim() || '',
        highlight: String(s?.highlight || '').trim() || '',
      })),
    };

    const featuredProducts = resolvedProducts.slice(0, 6).map((p) => ({
      name: p.name,
      note: p.code || p.sku ? `Código: ${String(p.code || p.sku)}` : '',
      priceLabel: p.prices[0]?.label || 'Precio',
      priceValue: p.prices[0]?.value || 'Bajo solicitud',
      stock: typeof p.stock === 'number' ? String(p.stock) : '-',
    }));

    const catalogHtml = buildCatalogHtml({
      origin,
      brandName,
      logoUrl,
      contactLine,
      printedAt,
      categoryLabel: categorySlug,
      currency,
      exchangeRate,
      priceTypes,
      sortLabel,
      copy: finalCopy,
      products: resolvedProducts,
    });

    return NextResponse.json({
      ok: true,
      catalog: {
        ...finalCopy,
        featuredProducts,
        catalogHtml,
      },
      filters: {
        category: categorySlug,
        priceTypes,
        currency,
        printedAt,
      },
    });
  } catch (error: any) {
    console.error('AI catalog generation failed', error);
    return NextResponse.json({
      error: error?.message || 'No se pudo generar el catálogo.',
    }, { status: 500 });
  }
}
