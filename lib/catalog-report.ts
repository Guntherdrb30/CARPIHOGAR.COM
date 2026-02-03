export const PRICE_TYPE_META: Record<string, { label: string; field: string }> = {
  client: { label: 'Cliente', field: 'priceUSD' },
  ally: { label: 'Aliado', field: 'priceAllyUSD' },
  wholesale: { label: 'Mayorista', field: 'priceWholesaleUSD' },
};

export const DEFAULT_PRICE_TYPES = ['client'];
export const ALLOWED_CURRENCIES = new Set(['USD', 'VES']);
export const ALLOWED_SORTS = new Set(['name', 'price', 'stock']);

export const toNumber = (value: any): number => {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value?.toNumber === 'function') {
    const n = value.toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const resolveSortLabel = (sortBy: string, sortDir: string) => {
  if (sortBy === 'price') {
    return sortDir === 'desc' ? 'Precio (mayor a menor)' : 'Precio (menor a mayor)';
  }
  if (sortBy === 'stock') {
    return sortDir === 'asc' ? 'Stock (menor a mayor)' : 'Stock (mayor a menor)';
  }
  return sortDir === 'desc' ? 'Nombre (Z-A)' : 'Nombre (A-Z)';
};

export const parsePriceTypes = (value?: string | null): string[] => {
  if (!value) return [...DEFAULT_PRICE_TYPES];
  const normalized = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => PRICE_TYPE_META[token]);
  return normalized.length ? normalized : [...DEFAULT_PRICE_TYPES];
};

export const parseCurrency = (value?: string | null): 'USD' | 'VES' => {
  if (!value) return 'USD';
  const normalized = value.trim().toUpperCase();
  return ALLOWED_CURRENCIES.has(normalized) ? (normalized as 'USD' | 'VES') : 'USD';
};

export const sortProducts = (products: any[], sortBy: string, sortDir: string) => {
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
