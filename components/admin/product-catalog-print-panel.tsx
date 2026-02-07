'use client';

import { ChangeEvent, useCallback, useMemo, useState } from 'react';
import { normalizeCatalogImageUrl } from '@/lib/catalog-image';

type ProductCatalogPrintPanelProps = {
  products: any[];
  categories: any[];
  settings: any;
};

type AiResult = {
  summary: string;
  coverTitle: string;
  coverSubtitle?: string;
  coverDescription?: string;
  sections?: Array<{ title: string; text: string; highlight?: string }>;
  featuredProducts?: Array<{
    name: string;
    note?: string;
    priceLabel: string;
    priceValue: string;
    stock?: string;
  }>;
  catalogHtml: string;
};

const sortOptions = [
  { value: 'name::asc', label: 'Nombre (A-Z)' },
  { value: 'name::desc', label: 'Nombre (Z-A)' },
  { value: 'price::asc', label: 'Precio (menor a mayor)' },
  { value: 'price::desc', label: 'Precio (mayor a menor)' },
  { value: 'stock::desc', label: 'Stock (mayor a menor)' },
];

const PRICE_TYPE_OPTIONS = [
  { value: 'client', label: 'Cliente', field: 'priceUSD' },
  { value: 'ally', label: 'Aliado', field: 'priceAllyUSD' },
  { value: 'wholesale', label: 'Mayorista', field: 'priceWholesaleUSD' },
];

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD (Dólares)' },
  { value: 'VES', label: 'VES (Bolívares)' },
];

export default function ProductCatalogPrintPanel({
  products,
  categories,
  settings,
}: ProductCatalogPrintPanelProps) {
  const [category, setCategory] = useState('');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [sortValue, setSortValue] = useState(sortOptions[0].value);
  const [priceType, setPriceType] = useState<string>('client');
  const [priceTouched, setPriceTouched] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [itemsPerPage, setItemsPerPage] = useState(4);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [sortBy, sortDir] = sortValue.split('::');

  const selectedPriceOption = useMemo(() => {
    return PRICE_TYPE_OPTIONS.find((option) => option.value === priceType) || PRICE_TYPE_OPTIONS[0];
  }, [priceType]);
  const selectedPriceField = selectedPriceOption.field;

  const filteredProducts = useMemo(() => {
    const useCategory = Boolean(category);
    const baseList = Array.isArray(products) ? products : [];

    const filtered = useCategory
      ? baseList.filter((product) => product?.category?.slug === category)
      : [...baseList];

    const comparator = (a: any, b: any) => {
      const safeNumber = (value: any) =>
        typeof value === 'number' && isFinite(value) ? value : 0;
      if (sortBy === 'price') {
        return safeNumber(a?.[selectedPriceField]) - safeNumber(b?.[selectedPriceField]);
      }
      if (sortBy === 'stock') {
        return safeNumber(a?.stock) - safeNumber(b?.stock);
      }
      const nameA = String(a?.name || '').toLowerCase();
      const nameB = String(b?.name || '').toLowerCase();
      return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
    };

    filtered.sort((a, b) => (sortDir === 'desc' ? -comparator(a, b) : comparator(a, b)));
    return filtered;
  }, [products, category, sortBy, sortDir, selectedPriceField]);

  const exchangeRate = useMemo(() => {
    const rate = Number(settings?.tasaVES ?? 0);
    return rate > 0 ? rate : 1;
  }, [settings]);
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('es-VE', {
        style: 'currency',
        currency,
      }),
    [currency]
  );
  const convertToCurrency = useCallback(
    (value: number) => (currency === 'VES' ? value * exchangeRate : value),
    [currency, exchangeRate]
  );
  const formatCurrency = useCallback(
    (value: number) => currencyFormatter.format(convertToCurrency(value)),
    [convertToCurrency, currencyFormatter]
  );

  const priceSummary = selectedPriceOption.label;
  const togglePriceType = useCallback((value: string) => {
    setPriceType(value);
    setPriceTouched(true);
  }, []);
  const handleCategoryChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setCategory(event.target.value);
    setCategoryTouched(true);
  }, []);
  const handleCurrencyChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value === 'VES' ? 'VES' : 'USD';
    setCurrency(next);
  }, []);
  const handleItemsPerPageChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = Number(event.target.value);
      const clamped = Number.isFinite(value) ? Math.min(Math.max(value, 1), 8) : itemsPerPage;
      setItemsPerPage(clamped);
    },
    [itemsPerPage]
  );

  const readyToGenerate =
    filteredProducts.length > 0 && Boolean(priceType) && categoryTouched && priceTouched;
  const previewProducts = filteredProducts.slice(0, itemsPerPage);
  const placeholderCount = Math.max(0, 8 - previewProducts.length);
  const displayedCategory = categories.find((c) => c.slug === category);
  const categoryLabel = displayedCategory ? displayedCategory.name : 'Todas las categorías';
  const sortLabel = sortOptions.find((option) => option.value === sortValue)?.label || 'Nombre (A-Z)';
  const contactLine = [
    settings?.contactEmail,
    settings?.contactPhone,
    settings?.legalCompanyAddress,
  ]
    .filter(Boolean)
    .join(' • ');
  const brandName = settings?.brandName || 'Carpihogar.ai';
  const logoUrl = settings?.logoUrl;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const aiLogoUrl = `${origin}/logo-catalogo.svg`;

  const generateAiCatalog = useCallback(async () => {
    if (!readyToGenerate) return;
    setAiError(null);
    setAiResult(null);
    setAiGenerating(true);
    try {
      const maxProductsForCatalog = 240; // avoids huge payloads; supports multiple 24-item pages
      const payload = {
        products: filteredProducts.slice(0, maxProductsForCatalog).map((product) => ({
          id: product.id,
          name: product.name,
          slug: product.slug,
          brand: product.brand,
          category: product.category?.name || product.category?.slug || null,
          priceUSD: product.priceUSD,
          priceAllyUSD: product.priceAllyUSD,
          priceWholesaleUSD: product.priceWholesaleUSD,
          stock: product.stock,
          sku: product.sku,
          code: product.code,
          image: normalizeCatalogImageUrl(product?.images?.[0]) || null,
        })),
        filters: {
          category: category || 'Todas las categorías',
          priceTypes: [priceType],
          currency,
          sortBy,
          sortDir,
        },
        metadata: {
          brandName,
          logoUrl: aiLogoUrl,
          contactLine,
        },
      };
      const resp = await fetch('/api/reports/catalog/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || 'No se pudo generar el catálogo.');
      }
      setAiResult(json.catalog);
    } catch (error: any) {
      setAiError(error?.message || 'No se pudo generar el catálogo con IA.');
    } finally {
      setAiGenerating(false);
    }
  }, [readyToGenerate, filteredProducts, priceType, category, currency, sortBy, sortDir, brandName, contactLine, aiLogoUrl]);

  const downloadAiCatalog = useCallback(() => {
    if (!aiResult?.catalogHtml || typeof window === 'undefined') return;
    const blob = new Blob([aiResult.catalogHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `catalogo-ia-${now}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [aiResult]);

  return (
    <>
      <section className="space-y-4 bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg font-semibold text-gray-900">Catálogo IA</p>
            <p className="text-sm text-gray-500">
              Genera un catálogo premium con estilo moderno y elegante usando los productos filtrados. La IA usará
              la nueva identidad visual y las reglas de precio seleccionadas.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
            <button
              type="button"
              disabled={!readyToGenerate || aiGenerating}
              onClick={generateAiCatalog}
              className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
                readyToGenerate && !aiGenerating
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {aiGenerating ? 'Generando catálogo...' : 'Generar catálogo con IA'}
            </button>
            <span className="text-xs font-medium text-gray-500">
              Selecciona categoría y un tipo de precio antes de generar; se usarán {filteredProducts.length} productos.
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2 text-sm text-gray-700">
            <span className="font-medium">Categoría</span>
            <select
              value={category}
              onChange={handleCategoryChange}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-brand focus:outline-none"
            >
              <option value="">Todas las categorías</option>
              {categories.map((cat: any) => (
                <option key={`${cat.id}-${cat.slug || cat.name}`} value={cat.slug}>
                  {cat.depth && cat.depth > 0 ? `${' '.repeat(cat.depth * 2)}› ` : ''}
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-gray-700">
            <span className="font-medium">Organizado por</span>
            <select
              value={sortValue}
              onChange={(event) => setSortValue(event.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-brand focus:outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-2 text-sm text-gray-700">
            <span className="font-medium">Tipo de precio</span>
            <div className="flex flex-wrap gap-2">
              {PRICE_TYPE_OPTIONS.map((option) => {
                const isSelected = priceType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => togglePriceType(option.value)}
                    className={`px-3 py-1 rounded-full border text-sm font-semibold transition ${
                      isSelected
                        ? 'bg-brand text-white border-brand'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="space-y-2 text-sm text-gray-700">
            <span className="font-medium">Moneda del catálogo</span>
            <select
              value={currency}
              onChange={handleCurrencyChange}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-brand focus:outline-none"
            >
              {CURRENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-gray-700">
            <span className="font-medium">Productos por página</span>
            <select
              value={itemsPerPage}
              onChange={handleItemsPerPageChange}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-brand focus:outline-none"
            >
              {[4, 6, 8].map((value) => (
                <option key={value} value={value}>
                  {value} productos
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2 text-sm">
          <p>
            Categoría: <strong>{displayedCategory ? displayedCategory.name : 'Todas las categorías'}</strong> ·
            Tipo de precio: <strong>{priceSummary || 'Cliente'}</strong> ·
            Moneda: <strong>{currency}</strong>
          </p>
          {categoryTouched && priceTouched && !readyToGenerate && (
            <p className="text-xs text-red-600">Es necesario al menos un producto filtrado para generar el catálogo.</p>
          )}
        </div>

        {aiError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</div>}
        {aiResult && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-gray-900">{aiResult.coverTitle}</p>
              {aiResult.coverSubtitle && <p className="text-xs uppercase tracking-wide text-blue-600">{aiResult.coverSubtitle}</p>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadAiCatalog}
                className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90"
              >
                Descargar catálogo IA (HTML)
              </button>
              <span className="text-[11px] text-gray-600">Abre el archivo en tu editor o impresora para imprimir.</span>
            </div>
            {aiResult.catalogHtml && (
              <div className="mt-4 overflow-hidden rounded-xl border border-blue-100 bg-white">
                <div className="flex items-center justify-between border-b border-blue-100 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-500">Vista previa</p>
                  <p className="text-[11px] text-gray-500">Se imprime en páginas de 15 productos (3x5).</p>
                </div>
                <iframe
                  title="Vista previa catálogo IA"
                  className="h-[760px] w-full bg-white"
                  srcDoc={aiResult.catalogHtml}
                />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-4 space-y-4 rounded-2xl border border-dashed border-gray-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo"
                className="h-10 w-10 rounded-full bg-white object-contain p-1"
              />
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">{brandName}</p>
              <p className="text-[11px] text-gray-500">Catálogo · {categoryLabel}</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-500">{itemsPerPage} productos por página</p>
        </div>

        <div className="grid grid-cols-2 gap-3 py-3">
          {previewProducts.map((product) => {
            const rawValue = product?.[selectedPriceField];
            const numeric = rawValue == null ? null : Number(rawValue);
            const hasPrice = numeric != null && Number.isFinite(numeric);
            const previewImageUrl = normalizeCatalogImageUrl(product?.images?.[0]);

            return (
              <div
                key={product.id}
                className="space-y-1 rounded-lg border border-gray-200 bg-white p-2 text-[12px] leading-snug text-gray-700"
              >
                <div className="h-28 w-full overflow-hidden rounded-md bg-gray-100">
                  {previewImageUrl ? (
                    <img
                      src={previewImageUrl}
                      alt={product.name || 'Producto'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                      Sin imagen
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">Código: {product.code || product.sku || '—'}</p>
                <p className="font-semibold text-[13px] text-gray-900 leading-tight">{product.name}</p>
                <div className="space-y-0.5">
                  {hasPrice ? (
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>{selectedPriceOption.label}</span>
                      <span className="font-semibold text-sm text-amber-600">
                        {formatCurrency(numeric!)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400">Precios no disponibles</p>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">Stock: {Number(product.stock ?? 0)}</p>
              </div>
            );
          })}
          {Array.from({ length: placeholderCount }).map((_, idx) => (
            <div
              key={`placeholder-${idx}`}
              className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white p-2 text-[11px] text-gray-400"
            >
              <span>Espacio libre</span>
              <span>Sin producto</span>
            </div>
          ))}
        </div>

        {contactLine && <p className="text-[11px] text-gray-500">{contactLine}</p>}
      </section>
    </>
  );
}
