import { NextResponse } from 'next/server';
import { normalizeCatalogImageUrl } from '@/lib/catalog-image';
import {
  PRICE_TYPE_META,
  parseCurrency,
  parsePriceTypes,
  sortProducts,
} from '@/lib/catalog-report';
import { getProducts } from '@/server/actions/products';
import { getSettings } from '@/server/actions/settings';

const csvEscape = (value: string | number | undefined | null) => {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawCategory = String(url.searchParams.get('categorySlug') || '').trim();
  const rawSortBy = String(url.searchParams.get('sortBy') || 'name').trim().toLowerCase();
  const rawSortDir = String(url.searchParams.get('sortDir') || 'asc').trim().toLowerCase();
  const sortBy = ['name', 'price', 'stock'].includes(rawSortBy) ? rawSortBy : 'name';
  const sortDir = rawSortDir === 'desc' ? 'desc' : 'asc';
  const priceTypes = parsePriceTypes(url.searchParams.get('priceTypes'));
  const currency = parseCurrency(url.searchParams.get('currency'));

  const [settings, products] = await Promise.all([
    getSettings(),
    getProducts({ categorySlug: rawCategory || undefined }),
  ]);

  const exchangeRate = (() => {
    const rate = Number(settings?.tasaVES ?? 0);
    return rate > 0 ? rate : 1;
  })();

  const sortedProducts = sortProducts(products, sortBy, sortDir);

  const selectedPriceTypes = priceTypes
    .map((type) => PRICE_TYPE_META[type])
    .filter((meta): meta is { label: string; field: string } => Boolean(meta));
  const priceColumns = selectedPriceTypes.length
    ? selectedPriceTypes
    : [PRICE_TYPE_META.client];

  const convertCurrency = (value: number | null | undefined) => {
    if (!Number.isFinite(Number(value))) return null;
    const normalized = Number(value);
    return currency === 'VES' ? normalized * exchangeRate : normalized;
  };

  const formatPrice = (value: number | null | undefined) => {
    const converted = convertCurrency(value);
    return converted != null ? converted.toFixed(2) : '';
  };

  const headers = [
    'Nombre',
    'Código interno',
    'SKU',
    'Marca',
    'Categoría',
    ...priceColumns.map((meta) => `Precio ${meta.label} (${currency})`),
    'Stock',
    'Imagen pequeña (URL)',
    'Slug',
  ]
    .map(csvEscape)
    .join(';');

  const rows = sortedProducts.map((product) => {
    const firstImage = normalizeCatalogImageUrl(product?.images?.[0]) || '';
    const categoryName = product?.category?.name || '';
    const values = [
      product.name,
      product.code || '',
      product.sku || '',
      product.brand || '',
      categoryName,
      ...priceColumns.map((meta) => formatPrice(product?.[meta.field] ?? null)),
      Number.isFinite(Number(product.stock)) ? String(product.stock) : '',
      firstImage,
      product.slug || '',
    ];
    return values.map(csvEscape).join(';');
  });

  const safeCategory = rawCategory.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'general';
  const filename = `catalogo_${safeCategory}_listado.csv`;
  const payload = ['\ufeff' + headers, ...rows].join('\r\n');

  return new NextResponse(payload, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
