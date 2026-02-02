import fs from 'fs';
import path from 'path';

import { NextResponse } from 'next/server';
import { getProducts } from '@/server/actions/products';
import { getSettings } from '@/server/actions/settings';
import prisma from '@/lib/prisma';
import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
import sharp from 'sharp';

const DEFAULT_ITEMS_PER_PAGE = 8;
const ALLOWED_SORTS = new Set(['name', 'price', 'stock']);
const PRICE_TYPE_META: Record<string, { label: string; field: string }> = {
  client: { label: 'Cliente', field: 'priceUSD' },
  ally: { label: 'Aliado', field: 'priceAllyUSD' },
  wholesale: { label: 'Mayorista', field: 'priceWholesaleUSD' },
};
const DEFAULT_PRICE_TYPES = ['client'];
const ALLOWED_CURRENCIES = new Set(['USD', 'VES']);

const toNumber = (value: any): number => {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value?.toNumber === 'function') {
    const n = value.toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveSortLabel = (sortBy: string, sortDir: string) => {
  if (sortBy === 'price') {
    return sortDir === 'desc' ? 'Precio (mayor a menor)' : 'Precio (menor a mayor)';
  }
  if (sortBy === 'stock') {
    return sortDir === 'asc' ? 'Stock (menor a mayor)' : 'Stock (mayor a menor)';
  }
  return sortDir === 'desc' ? 'Nombre (Z-A)' : 'Nombre (A-Z)';
};

const parsePriceTypes = (value?: string | null): string[] => {
  if (!value) return [...DEFAULT_PRICE_TYPES];
  const normalized = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => PRICE_TYPE_META[token]);
  return normalized.length ? normalized : [...DEFAULT_PRICE_TYPES];
};

const parseCurrency = (value?: string | null): 'USD' | 'VES' => {
  if (!value) return 'USD';
  const normalized = value.trim().toUpperCase();
  return ALLOWED_CURRENCIES.has(normalized) ? (normalized as 'USD' | 'VES') : 'USD';
};

const optimizeImageBuffer = async (source: Buffer) => {
  try {
    return await sharp(source)
      .resize({ width: 200, height: 120, fit: 'inside' })
      .jpeg({ quality: 60, mozjpeg: true })
      .toBuffer();
  } catch {
    return source;
  }
};

const loadImageBuffer = async (source?: string | null): Promise<Buffer | null> => {
  if (!source) return null;
  try {
    if (source.startsWith('http')) {
      const response = await fetch(source);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return optimizeImageBuffer(Buffer.from(arrayBuffer));
    }
    const normalized = source.replace(/^\/+/, '');
    const targetPath = path.join(process.cwd(), 'public', normalized);
    if (fs.existsSync(targetPath)) {
      return optimizeImageBuffer(fs.readFileSync(targetPath));
    }
  } catch {
    // ignore image download errors
  }
  return null;
};

const sortProducts = (products: any[], sortBy: string, sortDir: string) => {
  const comparator = (a: any, b: any) => {
    if (sortBy === 'price') {
      return toNumber(a?.priceUSD) - toNumber(b?.priceUSD);
    }
    if (sortBy === 'stock') {
      return toNumber(a?.stock) - toNumber(b?.stock);
    }
    const nameA = String(a?.name || '').toLowerCase();
    const nameB = String(b?.name || '').toLowerCase();
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
  };
  const copy = [...products];
  copy.sort((a, b) => (sortDir === 'desc' ? -comparator(a, b) : comparator(a, b)));
  return copy;
};

type BuildCatalogPdfParams = {
  products: any[];
  settings: any;
  categoryLabel: string;
  sortLabel: string;
  priceTypes: string[];
  currency: 'USD' | 'VES';
  exchangeRate: number;
  itemsPerPage: number;
};

const buildCatalogPdf = async ({
  products,
  settings,
  categoryLabel,
  sortLabel,
  priceTypes,
  currency,
  exchangeRate,
  itemsPerPage,
}: BuildCatalogPdfParams) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  const ready = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const margin = 40;
  const columnGap = 18;
  const rowGap = 14;
  const columns = 2;
  const cellWidth = (doc.page.width - margin * 2 - columnGap) / columns;
  const cellHeight = 150;
  const imageHeight = 72;
  const brandName = settings?.brandName || 'Carpihogar';
  const primaryColor = settings?.primaryColor || '#0ea5e9';
  const logoBuffer = await loadImageBuffer(settings?.logoUrl || '/logo-catalog.svg');
  const contactLine = [
    settings?.brandName,
    settings?.contactEmail,
    settings?.contactPhone,
    settings?.legalCompanyName,
    settings?.legalCompanyAddress,
  ]
    .filter(Boolean)
    .join(' • ');
  const normalizedPriceTypes = priceTypes
    .map((type) => PRICE_TYPE_META[type])
    .filter((meta): meta is { label: string; field: string } => Boolean(meta));
  const selectedPriceTypes =
    normalizedPriceTypes.length > 0 ? normalizedPriceTypes : [PRICE_TYPE_META.client];
  const priceSummary =
    selectedPriceTypes.map((meta) => meta.label).join(', ') || PRICE_TYPE_META.client.label;
  const convertValue = (value: number) => (currency === 'VES' ? value * exchangeRate : value);
  const priceFormatter = new Intl.NumberFormat('es-VE', { style: 'currency', currency });
  const headerHeight = 80;

  const drawHeader = () => {
    const headerTop = margin;
    doc.save();
    doc.rect(margin, headerTop - 12, doc.page.width - margin * 2, headerHeight).fill(primaryColor);
    doc.restore();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(`${brandName} · Catálogo`, margin + 6, headerTop - 4);
    doc.font('Helvetica').fontSize(11).text(categoryLabel, margin + 6, headerTop + 16);
    doc.font('Helvetica').fontSize(10).text(`Ordenado por: ${sortLabel}`, margin + 6, headerTop + 32);
    doc.font('Helvetica').fontSize(10).text(`Moneda: ${currency} · Precios: ${priceSummary}`, margin + 6, headerTop + 48);
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, doc.page.width - margin - 70, headerTop - 6, {
          fit: [70, 70],
          align: 'right',
          valign: 'top',
        });
      } catch {}
    }
    doc.fillColor('#111827');
  };

  const drawFooter = () => {
    if (!contactLine) return;
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    const footerY = doc.page.height - margin + 4;
    doc.text(contactLine, margin, footerY, {
      width: doc.page.width - margin * 2,
      align: 'center',
    });
    doc.fillColor('#111827');
  };

  const drawProductsOnPage = async (pageProducts: any[]) => {
    const startY = margin + headerHeight + 10;

    if (!pageProducts.length) {
      doc.font('Helvetica').fontSize(12).fillColor('#334155').text(
        'No hay productos disponibles para este catálogo.',
        margin,
        startY + 30,
        { width: doc.page.width - margin * 2, align: 'center' }
      );
      doc.fillColor('#111827');
      return;
    }

    for (let index = 0; index < pageProducts.length; index += 1) {
      const product = pageProducts[index];
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + column * (cellWidth + columnGap);
      const y = startY + row * (cellHeight + rowGap);

      doc.save();
      doc.lineWidth(0.5);
      doc.strokeColor('#e5e7eb');
      doc.rect(x, y, cellWidth, cellHeight).stroke();
      doc.restore();

      const imageX = x + 8;
      const imageY = y + 8;
      const imageWidth = cellWidth - 16;
      const imageBuffer = await loadImageBuffer(product?.images?.[0]);
      if (imageBuffer) {
        try {
          doc.image(imageBuffer, imageX, imageY, {
            fit: [imageWidth, imageHeight],
            align: 'center',
            valign: 'center',
          });
        } catch {}
      } else {
        doc.save();
        doc.lineWidth(0.5);
        doc.strokeColor('#e5e7eb');
        doc.rect(imageX, imageY, imageWidth, imageHeight).stroke();
        doc.fillColor('#9ca3af');
        doc.font('Helvetica').fontSize(9).text('Sin imagen', imageX, imageY + imageHeight / 2 - 6, {
          width: imageWidth,
          align: 'center',
        });
        doc.restore();
      }

      let textY = imageY + imageHeight + 6;
      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      doc.text(`Código: ${product?.code || product?.sku || '—'}`, x + 8, textY, {
        width: cellWidth - 16,
      });
      textY += 12;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a');
      doc.text(product?.name || '—', x + 8, textY, {
        width: cellWidth - 16,
        lineBreak: true,
      });
      textY += 18;

      const priceEntries = selectedPriceTypes
        .map((meta) => {
          const rawValue = product?.[meta.field];
          if (rawValue == null) return null;
          const numeric = Number(rawValue);
          if (!Number.isFinite(numeric)) return null;
          return { label: meta.label, value: numeric };
        })
        .filter((entry): entry is { label: string; value: number } => Boolean(entry));

      if (priceEntries.length) {
        for (const entry of priceEntries) {
          const formatted = priceFormatter.format(convertValue(entry.value));
          doc.font('Helvetica').fontSize(9).fillColor('#475569');
          doc.text(`${entry.label}: ${formatted}`, x + 8, textY, {
            width: cellWidth - 16,
          });
          textY += 12;
        }
      } else {
        doc.font('Helvetica').fontSize(9).fillColor('#9ca3af');
        doc.text('Precio no disponible', x + 8, textY, {
          width: cellWidth - 16,
        });
        textY += 12;
      }

      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      doc.text(`Stock: ${toNumber(product?.stock)}`, x + 8, textY, {
        width: cellWidth - 16,
      });
    }
  };

  const renderPage = async (pageProducts: any[], pageIndex: number) => {
    if (pageIndex > 0) doc.addPage();
    drawHeader();
    await drawProductsOnPage(pageProducts);
    drawFooter();
  };

  if (!products.length) {
    await renderPage([], 0);
  } else {
    for (let pageIndex = 0; pageIndex * itemsPerPage < products.length; pageIndex += 1) {
      const slice = products.slice(pageIndex * itemsPerPage, pageIndex * itemsPerPage + itemsPerPage);
      await renderPage(slice, pageIndex);
    }
  }

  doc.end();
  return ready;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawCategory = String(url.searchParams.get('categorySlug') || '').trim();
  const rawSortBy = String(url.searchParams.get('sortBy') || 'name').trim().toLowerCase();
  const rawSortDir = String(url.searchParams.get('sortDir') || 'asc').trim().toLowerCase();
  const sortBy = ALLOWED_SORTS.has(rawSortBy) ? rawSortBy : 'name';
  const sortDir = rawSortDir === 'desc' ? 'desc' : 'asc';
  const priceTypes = parsePriceTypes(url.searchParams.get('priceTypes'));
  const currency = parseCurrency(url.searchParams.get('currency'));
  const itemsPerPageParam = Number(url.searchParams.get('itemsPerPage'));
  const itemsPerPage =
    Number.isFinite(itemsPerPageParam) && itemsPerPageParam > 0 && itemsPerPageParam <= 8
      ? Math.floor(itemsPerPageParam)
      : DEFAULT_ITEMS_PER_PAGE;
  const rawProductIds = String(url.searchParams.get('productIds') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const allProducts = await getProducts({
    categorySlug: rawCategory || undefined,
  });
  const settings = await getSettings();
  const category = rawCategory
    ? await prisma.category.findFirst({ where: { slug: rawCategory } })
    : null;
  const categoryLabel = category?.name || 'Todos los productos';
  const sortedProducts = sortProducts(allProducts, sortBy, sortDir);
  const requestedProductIds = Array.from(new Set(rawProductIds));
  let effectiveProducts = sortedProducts;
  if (requestedProductIds.length) {
    const lookup = new Map(sortedProducts.map((p) => [p.id, p]));
    const ordered = requestedProductIds.map((id) => lookup.get(id)).filter(Boolean);
    if (ordered.length) {
      effectiveProducts = ordered;
    }
  }
  const sortLabel = resolveSortLabel(sortBy, sortDir);
  const exchangeRate = (() => {
    const rate = Number(settings?.tasaVES ?? 0);
    return rate > 0 ? rate : 1;
  })();
  const pdfBuffer = await buildCatalogPdf({
    products: effectiveProducts,
    settings,
    categoryLabel,
    sortLabel,
    priceTypes,
    currency,
    exchangeRate,
    itemsPerPage,
  });

  const safeCategory = rawCategory.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'general';
  const filename = `catalogo_${safeCategory}_${currency.toLowerCase()}_${Date.now()}.pdf`;
  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
