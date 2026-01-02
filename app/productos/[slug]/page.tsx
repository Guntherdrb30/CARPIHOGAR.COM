import { notFound } from 'next/navigation';
import type { Product } from '@prisma/client';
import { getProductPageData } from '@/server/actions/products';
import ProductDetailClient from '@/components/product/ProductDetailClient';

export default async function ProductoDetallePage({ params }: { params: { slug: string } }) {
  const { product, settings, relatedProducts } = await getProductPageData(params.slug);

  if (!product || !settings) {
    notFound();
  }

  return (
    <ProductDetailClient
      product={product as Product}
      settings={settings as any}
      relatedProducts={relatedProducts as any[]}
    />
  );
}
