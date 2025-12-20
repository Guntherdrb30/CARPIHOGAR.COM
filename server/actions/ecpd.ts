'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { applyPriceAdjustments, getPriceAdjustmentSettings } from '@/server/price-adjustments';

type EcpdConfig = {
  name: string;
  schema: any;
};

export async function getConfigurableProducts(): Promise<
  Array<{
    id: string;
    name: string;
    slug: string;
    isConfigurable: boolean;
    configSchema: any | null;
    images: string[];
    priceUSD: number | null;
  }>
> {
  const pricing = await getPriceAdjustmentSettings();
  const products = await prisma.product.findMany({
    where: { isConfigurable: true },
    select: {
      id: true,
      name: true,
      slug: true,
      isConfigurable: true,
      configSchema: true,
      images: true,
      priceUSD: true,
      categoryId: true,
      supplier: { select: { chargeCurrency: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return products.map((p) => {
    const base =
      typeof (p as any).priceUSD === 'number'
        ? ((p as any).priceUSD as number)
        : (p as any).priceUSD?.toNumber?.() ?? null;
    const categoryId = (p as any).categoryId || null;
    const supplierCurrency = (p as any).supplier?.chargeCurrency || null;
    return {
      ...p,
      configSchema: (p as any).configSchema ?? null,
      images: Array.isArray((p as any).images) ? ((p as any).images as string[]) : [],
      priceUSD:
        base != null
          ? applyPriceAdjustments({
              basePriceUSD: base,
              currency: 'USD',
              supplierCurrency,
              categoryId,
              settings: pricing,
            })
          : null,
    };
  });
}

export async function getConfigurableProductBySlug(rawSlug: string) {
  // Para evitar cualquier inconsistencia entre rutas y BD,
  // resolvemos siempre partiendo del listado de configurables.
  let cleaned = String(rawSlug || '').trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // ignorar errores de decodeURIComponent
  }

  const normalize = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

  const target = normalize(cleaned);

  // Usamos el mismo origen de datos que la página índice
  const list = await getConfigurableProducts();
  if (!list.length) return null;

  const matchBasic =
    list.find((p) => normalize(p.slug) === target) ||
    list.find((p) => normalize(p.name) === target) ||
    list[0];

  const pricing = await getPriceAdjustmentSettings();
  const p = await prisma.product.findUnique({
    where: { id: matchBasic.id },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      description: true,
      images: true,
      priceUSD: true,
      widthCm: true,
      heightCm: true,
      depthCm: true,
      isConfigurable: true,
      configSchema: true,
      categoryId: true,
      supplier: { select: { chargeCurrency: true } },
    },
  });

  if (!p || !(p as any).isConfigurable) return null;

  const base =
    typeof (p as any).priceUSD === 'number'
      ? ((p as any).priceUSD as number)
      : (p as any).priceUSD?.toNumber?.() ?? null;
  const categoryId = (p as any).categoryId || null;
  const supplierCurrency = (p as any).supplier?.chargeCurrency || null;
  return {
    ...p,
    images: Array.isArray((p as any).images) ? ((p as any).images as string[]) : [],
    priceUSD:
      base != null
        ? applyPriceAdjustments({
            basePriceUSD: base,
            currency: 'USD',
            supplierCurrency,
            categoryId,
            settings: pricing,
          })
        : null,
    configSchema: (p as any).configSchema ?? null,
  };
}

export async function setProductEcpdConfig(productId: string, config: EcpdConfig | null) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    throw new Error('Not authorized');
  }

  const data: any = {};
  if (config === null) {
    data.isConfigurable = false;
    data.configSchema = null;
  } else {
    data.isConfigurable = true;
    data.configSchema = config.schema ?? {};
  }

  await prisma.product.update({
    where: { id: productId },
    data,
  });

  revalidatePath('/dashboard/admin/productos/configurables');
}
