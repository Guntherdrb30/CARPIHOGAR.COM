const FALLBACK_CATALOG_ORIGIN = (() => {
  const candidate =
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_URL : undefined) ||
    (typeof process !== 'undefined' ? process.env.NEXTAUTH_URL : undefined) ||
    'https://carpihogar.com';
  return candidate.replace(/\/+$/, '');
})();

type NormalizeOptions = {
  origin?: string;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getResolvedOrigin = (options?: NormalizeOptions) => {
  const custom = options?.origin?.trim();
  if (custom) {
    return trimTrailingSlash(custom);
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return trimTrailingSlash(window.location.origin);
  }
  return FALLBACK_CATALOG_ORIGIN;
};

const PROTOCOL_RELATIVE_RE = /^\/\/[^/]+/i;

export function normalizeCatalogImageUrl(value?: string | null, options?: NormalizeOptions) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (PROTOCOL_RELATIVE_RE.test(trimmed)) return `https:${trimmed}`;
  const origin = getResolvedOrigin(options);
  if (!origin) return null;
  const relative = trimmed.replace(/^\/+/, '');
  return relative ? `${origin}/${relative}` : origin;
}
