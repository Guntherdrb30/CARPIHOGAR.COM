import { prisma } from '../../lib/db';
import { log } from '../../lib/logger';
import { applyPriceAdjustments, getPriceAdjustmentSettings } from '../../../../server/price-adjustments';

const STOPWORDS = new Set([
  'hola','tienes','tiene','quiero','buscar','busca','necesito','que','de','la','el','los','las','para','por','un','una','unos','unas','en','con','me','ayuda','asesores','ver','producto','productos','hay','alguno','alguna'
]);

function stripDiacritics(s: string): string {
  try { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { return s; }
}

function normalizeTerms(q: string): string[] {
  const base = q.toLowerCase().replace(/[\u00BF\?\u00A1\!\.,;:]/g, ' ').split(/\s+/)
    .filter(Boolean).filter((t) => !STOPWORDS.has(t)).map((t) => (t.length > 2 ? t : '')).filter(Boolean);
  const extras = base.map((t) => (t.endsWith('s') ? t.slice(0, -1) : '')).filter(Boolean);
  const nodiac = base.map((t) => stripDiacritics(t));
  const synonyms: string[] = [];
  const joined = stripDiacritics(base.join(' '));
  if (/\bpeinadora\b|\btocador\b|\bvanity\b/.test(joined)) synonyms.push('tocador','vanity','mueble','bano','banio','peinadora');
  if ((/mueble/.test(joined) || /vanity/.test(joined)) && /bano|banio/.test(joined)) synonyms.push('vanity','mueble','bano','banio');
  if (/\bbisagra(s)?\b/.test(joined)) synonyms.push('bisagra','bisagras','hinge');
  if (/\bsamet\b/.test(joined)) synonyms.push('samet');
  if (/\bmaster\b/.test(joined)) synonyms.push('master');
  return Array.from(new Set([...base, ...extras, ...nodiac, ...synonyms]));
}

export async function run(input: { q: string }) {
  const q = String(input?.q || '').trim();
  const terms = normalizeTerms(q);
  if (!q || terms.length === 0) {
    return { success: true, message: 'Sin términos de búsqueda', data: [] };
  }
  try {
    let items = await prisma.product.findMany({
      where: { AND: terms.map((t) => ({ OR: [
        { name: { contains: t, mode: 'insensitive' } },
        { description: { contains: t, mode: 'insensitive' } },
        { sku: { contains: t, mode: 'insensitive' } },
        { code: { contains: t, mode: 'insensitive' } },
      ] })) },
      select: { id: true, name: true, slug: true, images: true, priceClientUSD: true, priceUSD: true, categoryId: true },
      orderBy: { createdAt: 'desc' }, take: 20,
    });
    if (!items.length) {
      items = await prisma.product.findMany({ where: { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        ...terms.map((t) => ({ name: { contains: t, mode: 'insensitive' } })),
      ] }, select: { id: true, name: true, slug: true, images: true, priceClientUSD: true, priceUSD: true, categoryId: true }, orderBy: { createdAt: 'desc' }, take: 20 });
    }
    const pricing = await getPriceAdjustmentSettings();
    const mapped = items.map((p: any) => {
      const base = (p.priceClientUSD as any)
        ? Number(p.priceClientUSD)
        : ((p.priceUSD as any) ? Number(p.priceUSD) : 0);
      const priceUSD = applyPriceAdjustments({
        basePriceUSD: base,
        currency: 'USD',
        categoryId: p.categoryId || null,
        settings: pricing,
      });
      return { id: p.id, name: p.name, slug: p.slug, images: p.images || [], priceUSD };
    });
    log('mcp.products.search', { q, terms, count: mapped.length });
    return { success: true, message: `OK (${mapped.length})`, data: mapped };
  } catch (e: any) {
    log('mcp.products.search.error', { q, error: String(e?.message || e) }, 'error');
    return { success: false, message: 'No se pudo buscar productos', data: [] };
  }
}
