import fs from 'fs';
import path from 'path';

import { NextResponse } from 'next/server';
import { normalizeCatalogImageUrl } from '@/lib/catalog-image';
import {
  ALLOWED_SORTS,
  PRICE_TYPE_META,
  parseCurrency,
  parsePriceTypes,
  resolveSortLabel,
  sortProducts,
} from '@/lib/catalog-report';
import { getProducts } from '@/server/actions/products';
import { getSettings } from '@/server/actions/settings';
import prisma from '@/lib/prisma';
import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
import sharp from 'sharp';

const DEFAULT_ITEMS_PER_PAGE = 8;
const FALLBACK_IMAGE_ORIGIN = (
  process.env.NEXT_PUBLIC_URL ||
  process.env.NEXTAUTH_URL ||
  'https://carpihogar.com'
).replace(/\/+$/, '');

const cleanFooterText = (input: string) =>
  String(input || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

const splitFooterLines = (text: string, maxLines = 2, maxChars = 74) => {
  if (!text) return [];
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
      continue;
    }
    current = next;
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines.slice(0, maxLines);
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

const fetchRemoteImageBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return optimizeImageBuffer(Buffer.from(arrayBuffer));
  } catch {
    return null;
  }
};

const loadImageBuffer = async (source?: string | null): Promise<Buffer | null> => {
  if (!source) return null;
  const trimmed = String(source).trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    const encoded = trimmed.split(',', 2)[1];
    if (encoded) {
      try {
        return optimizeImageBuffer(Buffer.from(encoded, 'base64'));
      } catch {
        // ignore parse errors and continue with other candidates
      }
    }
  }

  const isAbsoluteRemote = /^https?:\/\//i.test(trimmed) || /^\/\//.test(trimmed);
  if (isAbsoluteRemote) {
    const remoteUrl = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    const remoteBuffer = await fetchRemoteImageBuffer(remoteUrl);
    if (remoteBuffer) return remoteBuffer;
  }

  const localRelative = trimmed.replace(/^\/+/, '');
  if (!isAbsoluteRemote && localRelative) {
    const localPath = path.join(process.cwd(), 'public', localRelative);
    if (fs.existsSync(localPath)) {
      try {
        return optimizeImageBuffer(fs.readFileSync(localPath));
      } catch {
        // ignore file read errors
      }
    }
  }

  if (!isAbsoluteRemote) {
    const remoteUrl = normalizeCatalogImageUrl(trimmed, { origin: FALLBACK_IMAGE_ORIGIN });
    if (remoteUrl) {
      const remoteBuffer = await fetchRemoteImageBuffer(remoteUrl);
      if (remoteBuffer) return remoteBuffer;
    }
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
  const contactLine = cleanFooterText(
    [
      settings?.brandName,
      settings?.contactEmail,
      settings?.contactPhone,
      settings?.legalCompanyName,
      settings?.legalCompanyAddress,
    ]
      .filter(Boolean)
      .join(' • '),
  );
  const footerLines = contactLine ? splitFooterLines(contactLine) : [];
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
    if (!footerLines.length) return;
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    const footerBaseY =
      doc.page.height - margin + 4 - Math.max(0, footerLines.length - 1) * 10;
    footerLines.forEach((line, index) => {
      doc.text(line, margin, footerBaseY + index * 10, {
        width: doc.page.width - margin * 2,
        align: 'center',
        lineBreak: false,
      });
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
  const allProducts = await getProducts({
    categorySlug: rawCategory || undefined,
  });
  const settings = await getSettings();
  const category = rawCategory
    ? await prisma.category.findFirst({ where: { slug: rawCategory } })
    : null;
  const categoryLabel = category?.name || 'Todos los productos';
  const sortedProducts = sortProducts(allProducts, sortBy, sortDir);
  const effectiveProducts = sortedProducts;
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
