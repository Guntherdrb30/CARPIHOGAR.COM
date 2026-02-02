'use client';

import { ChangeEvent, useCallback, useMemo, useState } from 'react';

type ProductCatalogPrintPanelProps = {
  products: any[];
  categories: any[];
  settings: any;
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
  const [sortValue, setSortValue] = useState(sortOptions[0].value);
  const [priceTypes, setPriceTypes] = useState<string[]>(['client']);
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [sortBy, sortDir] = sortValue.split('::');

  const filteredProducts = useMemo(() => {
    const hasCategory = Boolean(category);
    const baseList = Array.isArray(products) ? products : [];

    const filtered = hasCategory
      ? baseList.filter((product) => product?.category?.slug === category)
      : [...baseList];

    const comparator = (a: any, b: any) => {
      const safeNumber = (value: any) =>
        typeof value === 'number' && isFinite(value) ? value : 0;
      if (sortBy === 'price') {
        return safeNumber(a?.priceUSD) - safeNumber(b?.priceUSD);
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
  }, [products, category, sortBy, sortDir]);

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

  const selectedPriceOptions = useMemo(() => {
    const picked = PRICE_TYPE_OPTIONS.filter((option) => priceTypes.includes(option.value));
    return picked.length ? picked : [PRICE_TYPE_OPTIONS[0]];
  }, [priceTypes]);
  const priceSummary = selectedPriceOptions.map((option) => option.label).join(', ');
  const priceTypesParam = priceTypes.length ? priceTypes.join(',') : 'client';
  const togglePriceType = useCallback((value: string) => {
    setPriceTypes((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev;
        return prev.filter((type) => type !== value);
      }
      return [...prev, value];
    });
  }, []);
  const handleCurrencyChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value === 'VES' ? 'VES' : 'USD';
    setCurrency(next);
  }, []);

  const previewProducts = filteredProducts.slice(0, 8);
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

  const pdfHref = useMemo(() => {
    if (typeof window === 'undefined') return '#';
    const url = new URL('/api/reports/catalog/pdf', window.location.origin);
    if (category) url.searchParams.set('categorySlug', category);
    url.searchParams.set('sortBy', sortBy || 'name');
    url.searchParams.set('sortDir', sortDir || 'asc');
    url.searchParams.set('priceTypes', priceTypesParam);
    url.searchParams.set('currency', currency);
    return url.toString();
  }, [category, sortBy, sortDir, priceTypesParam, currency]);

  const brandName = settings?.brandName || 'Carpihogar.ai';
  const logoUrl = settings?.logoUrl;

  return (
    <section className="space-y-4 bg-white border border-gray-200 rounded-xl shadow-sm p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-lg font-semibold text-gray-900">Catálogo imprimible</p>
          <p className="text-sm text-gray-500">
            Genera un documento PDF con 8 productos por página que incluye logo y datos de contacto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand/90"
          >
            Descargar catálogo (PDF)
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2 text-sm text-gray-700">
          <span className="font-medium">Categoría</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
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
      </div>

      <div className="space-y-3">
        <div className="space-y-2 text-sm text-gray-700">
          <p className="font-medium">Tipo(s) de precio</p>
          <div className="flex flex-wrap gap-2">
            {PRICE_TYPE_OPTIONS.map((option) => {
              const isSelected = priceTypes.includes(option.value);
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

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">Vista previa</span>
        <span>Filtrando {filteredProducts.length} productos</span>
        <span>{categoryLabel}</span>
        <span>{sortLabel}</span>
        <span>Moneda: {currency}</span>
        {priceSummary && <span>Precios: {priceSummary}</span>}
        {contactLine && <span>{contactLine}</span>}
      </div>

      <div className="rounded-2xl border border-dashed border-gray-200 bg-slate-50 p-3">
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
          <p className="text-[11px] text-gray-500">8 productos por página</p>
        </div>

        <div className="grid grid-cols-2 gap-3 py-3">
          {previewProducts.map((product) => {
            const priceEntries = selectedPriceOptions
              .map((option) => {
                const rawValue = product?.[option.field];
                if (rawValue == null) return null;
                const numeric = Number(rawValue);
                if (!Number.isFinite(numeric)) return null;
                return { label: option.label, value: numeric };
              })
              .filter((entry): entry is { label: string; value: number } => Boolean(entry));

            return (
              <div
                key={product.id}
                className="space-y-1 rounded-lg border border-gray-200 bg-white p-2 text-[12px] leading-snug text-gray-700"
              >
                <div className="h-20 w-full overflow-hidden rounded-md bg-gray-100">
                  {product.images && product.images.length ? (
                    <img
                      src={product.images[0]}
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
                <p className="font-semibold text-sm text-gray-900 leading-tight">{product.name}</p>
                <div className="space-y-0.5">
                  {priceEntries.length ? (
                    priceEntries.map((entry) => (
                      <div
                        key={`${product.id}-${entry.label}`}
                        className="flex items-center justify-between text-[11px] text-gray-500"
                      >
                        <span>{entry.label}</span>
                        <span className="font-semibold text-sm text-amber-600">
                          {formatCurrency(entry.value)}
                        </span>
                      </div>
                    ))
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
      </div>
    </section>
  );
}
