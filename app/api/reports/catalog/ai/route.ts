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
  groupByCategory,
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
    slug?: string | null;
    code?: string | null;
    sku?: string | null;
    image?: string | null;
    category?: { name: string; slug: string; bannerUrl?: string | null } | null;
    stock?: number | null;
    prices: Array<{ label: string; value: string }>;
  }>;
  groupByCategory?: boolean;
}) {
  const perPage = 15; // 3 columns x 5 rows
  const safeGroupByCategory = Boolean(groupByCategory);
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

  const buildTotalPages = () => {
    if (!safeGroupByCategory) {
      const raw = chunk(products, perPage);
      const pages = raw.length ? raw : [[]];
      return Math.max(1, pages.length + 1);
    }

    // Cover + one intro page per category + N product pages per category.
    const groups = groupProductsByCategory(products);
    let productPages = 0;
    for (const g of groups) {
      const raw = chunk(g.products, perPage);
      const pages = raw.length ? raw : [[]];
      productPages += pages.length;
    }
    return Math.max(1, 1 + groups.length + productPages);
  };

  const totalPages = buildTotalPages();

  const renderCardsHtml = (pageProducts: typeof products) => {
    return pageProducts
      .map((p) => {
        const label = p.code || p.sku || 'SIN CODIGO';
        const href =
          p.slug && String(p.slug).trim()
            ? `${origin}/productos/${encodeURIComponent(String(p.slug).trim())}`
            : null;
        const stockText =
          typeof p.stock === 'number' && Number.isFinite(p.stock) ? `${p.stock}` : '-';
        const imgUrl = p.image ? escapeHtml(p.image) : '';
        const priceLines = p.prices
          .slice(0, 1)
          .map(
            (line) =>
              `<div class="price"><span class="price__label">${escapeHtml(line.label)}</span><span class="price__value">${escapeHtml(line.value)}</span></div>`,
          )
          .join('');
        const inner = `
              <div class="card__media">
                ${
                  imgUrl
                    ? `<img class="card__img" src="${imgUrl}" alt="${escapeHtml(p.name)}" />`
                    : `<div class="card__img card__img--empty">Sin imagen</div>`
                }
                <div class="card__overlay">
                  <div class="card__name">${escapeHtml(p.name)}</div>
                  <div class="card__codeLine"><span class="code__label">Código</span><span class="code__value">${escapeHtml(label)}</span></div>
                  <div class="card__prices">${priceLines}</div>
                  <div class="card__stock">Stock: <strong>${escapeHtml(stockText)}</strong></div>
                </div>
              </div>
          `;

        if (href) {
          return `
              <a class="card card--link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
                ${inner}
              </a>
            `;
        }

        return `
            <article class="card">
              ${inner}
            </article>
          `;
      })
      .join('');
  };

  const renderProductsPageHtml = ({
    pageProducts,
    pageNumber,
    pageCategoryLabel,
  }: {
    pageProducts: typeof products;
    pageNumber: number;
    pageCategoryLabel: string;
  }) => {
    const cards = renderCardsHtml(pageProducts);
    const safePageCategory = escapeHtml(pageCategoryLabel);
    return `
        <section class="page page--products">
          <header class="page__header page__header--compact">
            <div class="header__left">
              <div class="header__brand">
                <img class="header__logo" src="${escapeHtml(logoUrl)}" alt="${safeBrandName}" />
                <div class="header__brandText">
                  <div class="header__title">${safeBrandName}</div>
                  <div class="header__sub">${safePageCategory} - ${escapeHtml(priceLabelSummary)} - ${safeCurrency}${safeRate}</div>
                </div>
              </div>
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
  };

  const renderCategoryIntroPageHtml = ({
    group,
    pageNumber,
  }: {
    group: ReturnType<typeof groupProductsByCategory>[number];
    pageNumber: number;
  }) => {
    const catName = escapeHtml(group.name);
    const imageUrl = group.image ? escapeHtml(group.image) : '';
    const trust = group.trust;
    return `
      <section class="page page--category">
        <header class="page__header">
          <div class="brand">
            <img class="brand__logo" src="${escapeHtml(logoUrl)}" alt="${safeBrandName}" />
            <div class="brand__meta">
              <div class="brand__name">${safeBrandName}</div>
              <div class="brand__tag">CATEGORIA</div>
            </div>
          </div>
          <div class="meta">
            <div class="meta__row"><span>Categoria</span><strong>${catName}</strong></div>
            <div class="meta__row"><span>Precios</span><strong>${escapeHtml(priceLabelSummary || 'Cliente')}</strong></div>
            <div class="meta__row"><span>Moneda</span><strong>${safeCurrency}</strong></div>
          </div>
        </header>

        <div class="catHero">
          ${
            imageUrl
              ? `<img class="catHero__img" src="${imageUrl}" alt="${catName}" />`
              : `<div class="catHero__img catHero__img--empty"></div>`
          }
          <div class="catHero__overlay"></div>
          <div class="catHero__content">
            <div class="catHero__kicker">${escapeHtml(trust.kicker)}</div>
            <h2 class="catHero__title">${catName}</h2>
            <p class="catHero__lead">${escapeHtml(trust.lead)}</p>
          </div>
        </div>

        <div class="trustGrid">
          ${trust.bullets
            .map(
              (b) => `
            <div class="trust">
              <div class="trust__title">${escapeHtml(b.title)}</div>
              <div class="trust__text">${escapeHtml(b.text)}</div>
            </div>
          `,
            )
            .join('')}
        </div>

        <footer class="page__footer">
          <div class="footer__left">${safePrintedAt}</div>
          <div class="footer__center">${safeContact}</div>
          <div class="footer__right">Pagina ${pageNumber} / ${totalPages}</div>
        </footer>
      </section>
    `;
  };

  const coverSectionsHtml = (copy.sections || [])
    .slice(0, 3)
    .map(
      (section) => `
        <div class="section">
          <div class="section__kicker">${escapeHtml(section.highlight)}</div>
          <h3 class="section__title">${escapeHtml(section.title)}</h3>
          <p class="section__text">${escapeHtml(section.text)}</p>
        </div>
      `,
    )
    .join('');

  const coverHtml = `
    <section class="page page--cover">
      <header class="page__header">
        <div class="brand">
          <img class="brand__logo" src="${escapeHtml(logoUrl)}" alt="${safeBrandName}" />
          <div class="brand__meta">
            <div class="brand__name">${safeBrandName}</div>
            <div class="brand__tag">CATALOGO PREMIUM</div>
          </div>
        </div>
        <div class="meta">
          <div class="meta__row"><span>Categoria</span><strong>${safeCategory}</strong></div>
          <div class="meta__row"><span>Precios</span><strong>${escapeHtml(priceLabelSummary || 'Cliente')}</strong></div>
          <div class="meta__row"><span>Moneda</span><strong>${safeCurrency}</strong></div>
        </div>
      </header>

      <div class="cover">
        <h1 class="cover__title">${escapeHtml(copy.coverTitle)}</h1>
        <div class="cover__subtitle">${escapeHtml(copy.coverSubtitle)}</div>
        <p class="cover__desc">${escapeHtml(copy.coverDescription)}</p>
        <div class="cover__summary">${escapeHtml(copy.summary)}</div>
      </div>

      <div class="sections">
        ${coverSectionsHtml}
      </div>

      <footer class="page__footer">
        <div class="footer__left">${safePrintedAt}</div>
        <div class="footer__center">${safeContact}</div>
        <div class="footer__right">Pagina 1 / ${totalPages}</div>
      </footer>
    </section>
  `;

  const pagesHtml: string[] = [];
  pagesHtml.push(coverHtml);

  if (safeGroupByCategory) {
    const groups = groupProductsByCategory(products);
    let pageCursor = 2; // cover is 1
    for (const group of groups) {
      pagesHtml.push(renderCategoryIntroPageHtml({ group, pageNumber: pageCursor }));
      pageCursor += 1;

      const raw = chunk(group.products, perPage);
      const catPages = raw.length ? raw : [[]];
      for (const pageProducts of catPages) {
        pagesHtml.push(
          renderProductsPageHtml({
            pageProducts,
            pageNumber: pageCursor,
            pageCategoryLabel: group.name,
          }),
        );
        pageCursor += 1;
      }
    }
  } else {
    const raw = chunk(products, perPage);
    const productPages = raw.length ? raw : [[]];
    productPages.forEach((pageProducts, idx) => {
      pagesHtml.push(
        renderProductsPageHtml({
          pageProducts,
          pageNumber: idx + 2,
          pageCategoryLabel: categoryLabel,
        }),
      );
    });
  }

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
        --orange: #f97316;
        --shadow: 0 14px 40px rgba(2, 6, 23, 0.25);
        --radius: 16px;
        --gap: 12px;
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

      .catHero{
        margin-top: 16px;
        border-radius: calc(var(--radius) + 6px);
        border: 1px solid var(--line);
        overflow: hidden;
        position: relative;
        height: 150mm;
        background: radial-gradient(520px 260px at 25% 20%, rgba(249,115,22,0.18), transparent 65%),
                    radial-gradient(520px 260px at 82% 60%, rgba(14,165,233,0.14), transparent 65%),
                    #ffffff;
      }
      .catHero__img{ position:absolute; inset:0; width:100%; height:100%; object-fit: cover; filter: saturate(1.05) contrast(1.02); }
      .catHero__img--empty{ background: linear-gradient(135deg, rgba(249,115,22,0.16), rgba(14,165,233,0.14)); }
      .catHero__overlay{
        position:absolute; inset:0;
        background: linear-gradient(180deg, rgba(2,6,23,0.05), rgba(2,6,23,0.55));
      }
      .catHero__content{
        position:absolute;
        left: 16px;
        right: 16px;
        bottom: 16px;
        color: #ffffff;
        padding: 14px 14px;
        border-radius: var(--radius);
        background: rgba(15,23,42,0.55);
        border: 1px solid rgba(255,255,255,0.16);
        backdrop-filter: blur(8px);
      }
      .catHero__kicker{ font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase; opacity: 0.92; }
      .catHero__title{ margin: 8px 0 6px; font-size: 30px; line-height: 1.05; letter-spacing: -0.02em; }
      .catHero__lead{ margin: 0; max-width: 92%; font-size: 13px; line-height: 1.55; opacity: 0.95; }

      .trustGrid{
        margin-top: 12px;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
      }
      .trust{
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 12px 12px;
        background: #ffffff;
      }
      .trust__title{ font-weight: 800; font-size: 12px; letter-spacing: 0.02em; }
      .trust__text{ margin-top: 6px; font-size: 12px; color: var(--muted); line-height: 1.55; }

      .header__brand{ display:flex; gap: 10px; align-items:center; }
      .header__logo{ width: 34px; height: 34px; object-fit: contain; border-radius: 10px; background: #fff; border: 1px solid var(--line); padding: 6px; }
      .header__brandText{ display:flex; flex-direction: column; }
      .header__title{ font-weight: 900; letter-spacing: 0.02em; color: var(--orange); }
      .header__sub{ font-size: 12px; color: var(--muted); margin-top: 2px; }
      .header__sort{ font-size: 12px; color: var(--muted); text-align: right; }

      .grid{
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--gap);
        height: calc(297mm - 18mm - 16mm - 32mm - 18mm);
        grid-template-rows: repeat(5, 1fr);
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
      .card--link{
        color: inherit;
        text-decoration: none;
      }
      .card--link:focus{
        outline: 2px solid rgba(14,165,233,0.55);
        outline-offset: 2px;
      }
      .card__media{
        flex: 1 1 auto;
        background: #ffffff;
        display:block;
        position: relative;
      }
      .card__img{ width: 100%; height: 100%; object-fit: cover; display:block; }
      .card__img--empty{ width: 100%; height: 100%; display:flex; align-items:center; justify-content:center; color: #94a3b8; font-size: 11px; }
      .card__overlay{
        position: absolute;
        left: 10px;
        right: 10px;
        bottom: 10px;
        padding: 10px 10px;
        border-radius: 14px;
        background: rgba(255,255,255,0.92);
        border: 1px solid rgba(15, 23, 42, 0.14);
        box-shadow: 0 12px 24px rgba(2, 6, 23, 0.18);
        backdrop-filter: blur(8px);
      }
      .card__name{
        font-weight: 700;
        font-size: 12px;
        line-height: 1.2;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }
      .card__codeLine{
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 8px;
        font-size: 10px;
        color: var(--muted);
        letter-spacing: 0.04em;
      }
      .code__label{ text-transform: uppercase; letter-spacing: 0.16em; font-size: 8px; }
      .code__value{
        font-weight: 800;
        color: var(--ink);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        white-space: nowrap;
        overflow:hidden;
        text-overflow: ellipsis;
        max-width: 70%;
        text-align: right;
      }
      .card__prices{ display:flex; flex-direction: column; gap: 4px; }
      .price{ display:flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--muted); }
      .price__value{ font-weight: 800; color: var(--ink); }
      .price__label{ text-transform: uppercase; letter-spacing: 0.12em; font-size: 9px; }
      .card__stock{ margin-top: 4px; font-size: 10px; color: var(--muted); }
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
        .card__overlay{
          box-shadow: none;
          backdrop-filter: none;
          background: rgba(255,255,255,0.96);
        }
      }
    </style>
  </head>
  <body>
    ${pagesHtml.join('')}
  </body>
</html>`;
}

function stableHash(input: string) {
  // Tiny deterministic hash (no crypto) to pick variations per category.
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function groupProductsByCategory(
  products: Array<{
    category?: { name: string; slug: string; bannerUrl?: string | null } | null;
    image?: string | null;
  }>,
) {
  const map = new Map<
    string,
    {
      key: string;
      name: string;
      bannerUrl?: string | null;
      products: any[];
    }
  >();

  for (const p of products as any[]) {
    const key = p?.category?.slug ? String(p.category.slug) : '__otros__';
    const name = p?.category?.name ? String(p.category.name) : 'Otros';
    const bannerUrl = p?.category?.bannerUrl ?? null;
    const entry =
      map.get(key) || {
        key,
        name,
        bannerUrl,
        products: [],
      };
    entry.products.push(p);
    // Prefer explicit bannerUrl, but keep first seen if not set.
    if (!entry.bannerUrl && bannerUrl) entry.bannerUrl = bannerUrl;
    map.set(key, entry);
  }

  const groups = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const trustKickers = ['Compra con confianza', 'Calidad comprobada', 'Tu proyecto, respaldado', 'Atención que responde'];
  const trustLeads = [
    'Disponibilidad real, precios claros y un equipo listo para ayudarte a elegir lo correcto.',
    'Productos seleccionados para durar, con soporte y servicio antes y después de tu compra.',
    'Compra online con tranquilidad: información clara, atención rápida y respaldo Carpihogar.',
    'Elige seguro: asesoría, stock actualizado y opciones para entrega o retiro.',
  ];
  const bulletSets = [
    [
      { title: 'Stock actual', text: 'Mostramos la disponibilidad real de nuestra tienda al momento de imprimir.' },
      { title: 'Precios transparentes', text: 'Ves los precios según el tipo seleccionado, sin sorpresas.' },
      { title: 'Soporte Carpihogar', text: 'Te acompañamos con asesoría para que compres con seguridad.' },
    ],
    [
      { title: 'Compra online', text: 'Encuentra rápido lo que buscas y visita cada producto desde el catálogo.' },
      { title: 'Atención inmediata', text: 'Respondemos por WhatsApp y canales oficiales.' },
      { title: 'Respaldo y garantías', text: 'Trabajamos para que tu compra sea confiable y sin complicaciones.' },
    ],
    [
      { title: 'Selección curada', text: 'Productos pensados para carpintería y hogar con calidad consistente.' },
      { title: 'Disponibilidad real', text: 'Inventario actualizado para planificar tu compra.' },
      { title: 'Entrega coordinada', text: 'Opciones de entrega o retiro para avanzar sin retrasos.' },
    ],
  ];

  return groups.map((g) => {
    const seed = stableHash(g.key);
    const kicker = trustKickers[seed % trustKickers.length];
    const lead = trustLeads[seed % trustLeads.length];
    const bullets = bulletSets[seed % bulletSets.length];
    const image =
      (g.bannerUrl ? String(g.bannerUrl) : '') ||
      (g.products.find((p: any) => p?.image)?.image ? String(g.products.find((p: any) => p?.image)?.image) : '');
    return {
      ...g,
      image: image || null,
      trust: { kicker, lead, bullets },
    };
  });
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
          category: {
            select: {
              name: true,
              slug: true,
              bannerUrl: true,
            },
          },
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
    const slug = (db?.slug ?? (incoming as any)?.slug ?? null) as any;
    const category = (db as any)?.category
      ? {
          name: String((db as any).category.name || '').trim() || 'Sin categoría',
          slug: String((db as any).category.slug || '').trim() || 'sin-categoria',
          bannerUrl: (db as any).category.bannerUrl ?? null,
        }
      : null;
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
    const normalizedCategory =
      category && category.bannerUrl
        ? { ...category, bannerUrl: normalizeCatalogImageUrl(String(category.bannerUrl), { origin }) }
        : category;
    return { id, name, slug, category: normalizedCategory, code, sku, image, stock, prices };
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
            'Redacta el copy para un catálogo premium de Carpihogar. La primera página debe ser una presentación moderna y súper elegante sobre un TEMA DIFERENTE en cada generación (servicios de Carpihogar: tienda online, asesoría, envíos, atención, garantías, compras por volumen, etc). Incluye portada impactante y exactamente 3 secciones que desarrollen ese tema. No inventes datos de productos.',
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
      summary: `Tu proyecto empieza aquí: compra online, asesoría y entrega con el respaldo de ${brandName}.`,
      coverTitle: `Catálogo premium de ${brandName}`,
      coverSubtitle: 'CARPINTERIA Y HOGAR',
      coverDescription:
        'Descubre una experiencia de compra moderna: atención experta, disponibilidad real y soluciones para carpintería y hogar.',
      sections: [
        { title: 'Compra online', text: 'Explora el catálogo, compara precios y encuentra rápido lo que necesitas para tu proyecto.', highlight: 'Rápido y claro' },
        { title: 'Asesoría', text: 'Te ayudamos a elegir herrajes, materiales y soluciones según tu necesidad.', highlight: 'Atención experta' },
        { title: 'Entrega', text: 'Coordinamos disponibilidad y entrega para que avances sin retrasos.', highlight: 'Logística' },
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

    const isAllCategories =
      !parsedBody.filters?.category ||
      String(parsedBody.filters.category).trim().toLowerCase() === 'todas las categorías' ||
      String(parsedBody.filters.category).trim().toLowerCase() === 'todas las categorias';

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
      groupByCategory: isAllCategories,
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
