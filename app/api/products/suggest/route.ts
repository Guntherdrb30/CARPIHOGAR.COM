import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { applyPriceAdjustments, getPriceAdjustmentSettings } from '@/server/price-adjustments';

function toNum(x: any, fb: number | null = null) {
  try {
    if (x == null) return fb as any;
    if (typeof x === 'number') return x;
    if (typeof (x as any)?.toNumber === 'function') return (x as any).toNumber();
    const n = Number(x);
    return isNaN(n) ? (fb as any) : n;
  } catch { return fb as any; }
}

function normalize(s: string): string {
  try {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  } catch {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
}

function diceCoefficient(a: string, b: string): number {
  const ax = normalize(a);
  const bx = normalize(b);
  if (!ax || !bx) return 0;
  if (ax === bx) return 1;
  const bigrams = (str: string) => {
    const arr: string[] = [];
    for (let i = 0; i < str.length - 1; i++) arr.push(str.slice(i, i + 2));
    return arr;
  };
  const aB = bigrams(ax);
  const bB = bigrams(bx);
  if (!aB.length || !bB.length) return 0;
  const map = new Map<string, number>();
  for (const g of aB) map.set(g, (map.get(g) || 0) + 1);
  let overlap = 0;
  for (const g of bB) {
    const c = map.get(g) || 0;
    if (c > 0) { overlap++; map.set(g, c - 1); }
  }
  return (2 * overlap) / (aB.length + bB.length);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get('q') || '').trim();
  if (!qRaw) {
    return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const tokens = qRaw.split(/\s+/).filter(Boolean);
  const qLower = qRaw.toLowerCase();
  const looksLikeBarcode = /^(?:\d[\s-]?){8,14}\d$/.test(qRaw.replace(/\s+/g, ''));

  // Build Prisma where
  // Basic ES synonyms for carpintería/hogar context
  const SYN: Record<string, string[]> = {
    'peinadora': ['tocador'], 'tocador': ['peinadora'],
    'nevera': ['refrigerador', 'frigorifico', 'refrigeradora'],
    'refrigerador': ['nevera', 'frigorifico', 'refrigeradora'],
    'lavadora': ['lavaseca', 'washer'],
    'bombillo': ['foco', 'ampolleta', 'lampara'],
    'enchufe': ['tomacorriente', 'toma corriente'],
    'tomacorriente': ['enchufe', 'toma corriente'],
    'taladro': ['perforadora', 'drill'], 'perforadora': ['taladro', 'drill'],
    'destornillador': ['atornillador', 'screwdriver'],
    'llave inglesa': ['llave ajustable', 'wrench'], 'llave': ['wrench'],
    'mueble tv': ['rack tv', 'mesa tv', 'soporte tv'],
    'soporte tv': ['montura tv', 'mount tv'],
  };
  const expand = (t: string) => {
    const n = normalize(t);
    const arr = SYN[n] || [];
    return [t, ...arr];
  };
  const expanded = Array.from(new Set(tokens.flatMap(expand).filter(Boolean)));

  const andTokens = expanded.map((t) => ({
    OR: [
      { name: { contains: t, mode: 'insensitive' } },
      { sku: { contains: t, mode: 'insensitive' } },
      { code: { contains: t, mode: 'insensitive' } },
      { brand: { contains: t, mode: 'insensitive' } },
    ],
  }));

  const where: any = looksLikeBarcode
    ? { OR: [ { AND: andTokens }, { barcode: { contains: qRaw } } ] }
    : (andTokens.length ? { AND: andTokens } : {});

  try {
    const rows = await prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        images: true,
        stock: true,
        priceUSD: true,
        categoryId: true,
        sku: true,
        code: true,
        brand: true,
        createdAt: true,
        supplier: { select: { chargeCurrency: true } },
      },
      take: 80,
    });

    // Score and sort
    const scored = rows.map((r) => {
      const name = r.name || '';
      const sku = (r.sku || '').toLowerCase();
      const code = (r.code || '').toLowerCase();
      const brand = (r.brand || '').toLowerCase();
      const nameLower = name.toLowerCase();

      let score = 0;
      for (const t of expanded) {
        const tl = t.toLowerCase();
        if (!tl) continue;
        if (nameLower.includes(tl)) score += 10;
        if (nameLower.startsWith(tl)) score += 6;
        if (sku === tl) score += 30; else if (sku.includes(tl)) score += 15;
        if (code === tl) score += 25; else if (code.includes(tl)) score += 12;
        if (brand.includes(tl)) score += 3;
      }
      if (looksLikeBarcode && (r as any).barcode && String((r as any).barcode).includes(qRaw)) score += 40;
      if ((r.stock || 0) > 0) score += 2;
      // slight bump if full string in name
      if (nameLower.includes(qLower)) score += 8;

      // Fuzzy: consider overall similarity against name/sku/code/brand
      const qNorm = normalize(qRaw);
      const fuzzyName = diceCoefficient(qNorm, name);
      const fuzzySku = diceCoefficient(qNorm, sku);
      const fuzzyCode = diceCoefficient(qNorm, code);
      const fuzzyBrand = diceCoefficient(qNorm, brand);
      const fuzzy = Math.max(fuzzyName, fuzzySku, fuzzyCode, fuzzyBrand);
      // Weight fuzzy moderately (0..1 -> 0..22)
      score += Math.round(fuzzy * 22);

      return { r, score };
    });

    scored.sort((a, b) => b.score - a.score || (b.r.createdAt?.getTime?.() || 0) - (a.r.createdAt?.getTime?.() || 0));

    const pricing = await getPriceAdjustmentSettings();
    const items = scored.slice(0, 12).map(({ r }) => {
      const categoryId = (r as any).categoryId || null;
      const base = toNum((r as any).priceUSD, 0) as number;
      const supplierCurrency = (r as any).supplier?.chargeCurrency || null;
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        image: Array.isArray((r as any).images) && (r as any).images.length ? (r as any).images[0] : undefined,
        stock: r.stock || 0,
        priceUSD: applyPriceAdjustments({
          basePriceUSD: base,
          currency: 'USD',
          supplierCurrency,
          categoryId,
          settings: pricing,
        }),
        sku: (r as any).sku || undefined,
        code: (r as any).code || undefined,
      };
    });

    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.warn('[api/products/suggest] failed', e);
    return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
