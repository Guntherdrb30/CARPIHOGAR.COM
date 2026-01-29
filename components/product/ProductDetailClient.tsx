'use client';

import { useCallback, useEffect, useRef, useState, type WheelEvent } from 'react';
import type { Product } from '@prisma/client';
import Head from 'next/head';
import Price from '@/components/price';
import { ProductActions } from '@/components/product-actions';
import RelatedProductsCarousel from '@/components/related-products-carousel';
import Breadcrumb from '@/components/breadcrumb';

type ProductWithExtras = Omit<
  Product,
  'priceUSD' | 'priceAllyUSD' | 'avgCost' | 'lastCost' | 'images'
> & {
  priceUSD: number;
  priceAllyUSD?: number | null;
  avgCost?: number | null;
  lastCost?: number | null;
  images: string[];
  category?: {
    name: string;
    slug: string;
  } | null;
  videoUrl?: string | null;
  showSocialButtons?: boolean;
  isConfigurable?: boolean;
};

type SiteSettingsLike = {
  tasaVES: number;
  instagramHandle?: string | null;
  tiktokHandle?: string | null;
  whatsappPhone?: string | null;
};

type RelatedProductWithCategory = ProductWithExtras;

interface ProductDetailClientProps {
  product: ProductWithExtras;
  settings: SiteSettingsLike;
  relatedProducts: RelatedProductWithCategory[];
}

function ProductJsonLd({
  product,
  baseUrl,
}: {
  product: ProductWithExtras;
  baseUrl: string;
}) {
  const productUrl = `${baseUrl}/productos/${product.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.images[0] || `${baseUrl}/logo-default.svg`,
    sku: product.sku,
    brand: {
      '@type': 'Brand',
      name: (product as any).brand || 'Carpihogar',
    },
    offers: {
      '@type': 'Offer',
      price: product.priceUSD.toString(),
      priceCurrency: 'USD',
      availability:
        (product as any).stockUnits && (product as any).stockUnits > 0
          ? 'https://schema.org/InStock'
          : (product as any).stock > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
      url: productUrl,
    },
  };

  return (
    <Head>
      <link rel="canonical" href={productUrl} />
      <meta property="og:type" content="product" />
      <meta property="og:site_name" content="Carpihogar.ai" />
      <meta property="og:url" content={productUrl} />
      <meta property="og:title" content={product.name} />
      {product.description && (
        <meta property="og:description" content={product.description} />
      )}
      <meta
        property="og:image"
        content={product.images[0] || `${baseUrl}/logo-default.svg`}
      />
      <meta
        property="product:brand"
        content={(product as any).brand || 'Carpihogar'}
      />
      <meta
        property="product:availability"
        content={
          (product as any).stockUnits && (product as any).stockUnits > 0
            ? 'in stock'
            : (product as any).stock > 0
              ? 'in stock'
              : 'out of stock'
        }
      />
      <meta
        property="product:retailer_item_id"
        content={product.sku || product.id}
      />
      <meta
        property="product:price:amount"
        content={product.priceUSD.toString()}
      />
      <meta property="product:price:currency" content="USD" />
      <meta
        property="og:price:amount"
        content={product.priceUSD.toString()}
      />
      <meta property="og:price:currency" content="USD" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={product.name} />
      {product.description && (
        <meta name="twitter:description" content={product.description} />
      )}
      <meta
        name="twitter:image"
        content={product.images[0] || `${baseUrl}/logo-default.svg`}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </Head>
  );
}

function ProductImageGallery({
  images,
  videoUrl,
}: {
  images: string[];
  videoUrl?: string | null;
}) {
  const isVideo = (u?: string | null) =>
    !!u && /\.(mp4|webm|ogg)(\?.*)?$/i.test(u);
  const media = [...(images || [])];
  if (videoUrl && !isVideo(images?.[images.length - 1])) {
    media.push(videoUrl);
  }

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const selectedUrl = media[selectedIdx] || 'https://via.placeholder.com/400';
  const selectedIsVideo =
    isVideo(selectedUrl) ||
    (!!videoUrl &&
      selectedIdx === media.length - 1 &&
      selectedUrl === videoUrl);
  const isLightboxOpen = lightboxIndex !== null;
  const currentLightboxUrl =
    isLightboxOpen && lightboxIndex !== null && media[lightboxIndex]
      ? media[lightboxIndex]
      : null;

  const moveLightbox = useCallback(
    (direction: 1 | -1) => {
      setLightboxIndex((prev) => {
        if (media.length === 0) return null;
        const startIndex = prev ?? selectedIdx;
        const nextIndex =
          (startIndex + direction + media.length) % media.length;
        return nextIndex;
      });
    },
    [media.length, selectedIdx],
  );
  const handleLightboxClose = () => setLightboxIndex(null);
  const handleOpenLightbox = () =>
    !selectedIsVideo && setLightboxIndex(selectedIdx);
  const isLightboxVideo =
    currentLightboxUrl !== null && isVideo(currentLightboxUrl);
  const handleLightboxWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!currentLightboxUrl) return;
    event.preventDefault();
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (Math.abs(delta) < 10) return;
    moveLightbox(delta > 0 ? 1 : -1);
  };

  useEffect(() => {
    if (!isLightboxOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleLightboxClose();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveLightbox(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveLightbox(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, moveLightbox]);

  return (
    <div>
      <div
        className="overflow-hidden rounded-lg shadow-md mb-4 cursor-pointer"
        onClick={handleOpenLightbox}
      >
        {selectedIsVideo ? (
          <video controls className="w-full h-96 bg-black" src={selectedUrl} />
        ) : (
          <div
            style={{ backgroundImage: `url(${selectedUrl})` }}
            className="bg-gray-200 h-96 w-full bg-cover bg-center transform transition-transform duration-300 hover:scale-110"
          />
        )}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {media.map((url, index) => {
          const isV =
            isVideo(url) ||
            (!!videoUrl &&
              index === media.length - 1 &&
              url === videoUrl);
          return (
            <button
              key={index}
              type="button"
              className="overflow-hidden rounded-md cursor-pointer"
              onClick={() => setSelectedIdx(index)}
            >
              <div
                style={!isV ? { backgroundImage: `url(${url})` } : undefined}
                className={`bg-gray-200 h-20 w-full bg-cover bg-center transform transition-transform duration-300 hover:scale-110 ${
                  selectedIdx === index ? 'border-2 border-brand' : ''
                } relative`}
              >
                {isV && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white font-semibold">
                    Video
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {currentLightboxUrl && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
          onClick={handleLightboxClose}
          onWheel={handleLightboxWheel}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white text-3xl font-bold"
            onClick={(event) => {
              event.stopPropagation();
              handleLightboxClose();
            }}
            aria-label="Cerrar"
          >
            &times;
          </button>
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-white/60 bg-black/40 px-3 py-2 text-white text-2xl"
            onClick={(event) => {
              event.stopPropagation();
              moveLightbox(-1);
            }}
            aria-label="Imagen anterior"
          >
            ‹
          </button>
          <div
            className="flex items-center justify-center max-w-[90vw] max-h-[90vh]"
            onClick={(event) => event.stopPropagation()}
          >
            {isLightboxVideo ? (
              <video
                controls
                autoPlay={false}
                className="max-w-full max-h-full rounded-md shadow-xl"
                src={currentLightboxUrl}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentLightboxUrl}
                alt="Product image"
                className="max-w-full max-h-full rounded-md shadow-xl"
              />
            )}
          </div>
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-white/60 bg-black/40 px-3 py-2 text-white text-2xl"
            onClick={(event) => {
              event.stopPropagation();
              moveLightbox(1);
            }}
            aria-label="Imagen siguiente"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

const AnimatedTitle = ({ children }: { children: React.ReactNode }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  return (
    <h2
      ref={ref}
      className={`text-3xl font-bold text-center my-8 transition-all duration-1000 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      {children}
    </h2>
  );
};

export default function ProductDetailClient({
  product,
  settings,
  relatedProducts,
}: ProductDetailClientProps) {
  const breadcrumbItems = [{ name: 'Inicio', href: '/' }];

  if ((product as any).category) {
    breadcrumbItems.push({
      name: (product as any).category.name,
      href: `/categorias/${(product as any).category.slug}`,
    });
  }
  breadcrumbItems.push({
    name: product.name,
    href: `/productos/${product.slug}`,
  });

  const isConfigurable = Boolean((product as any).isConfigurable);
  const configurableHref = isConfigurable
    ? `/personalizar-muebles/${encodeURIComponent(
        String((product as any).slug || ''),
      )}`
    : null;


  return (
    <>
      <ProductJsonLd product={product} baseUrl="https://carpihogar.com" />
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8">
          <Breadcrumb
            items={breadcrumbItems}
            baseUrl="https://carpihogar.com"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <ProductImageGallery
            images={product.images}
            videoUrl={product.videoUrl}
          />

          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              {product.name}
            </h1>
            <div className="mb-4">
              <Price
                priceUSD={product.priceUSD}
                priceAllyUSD={product.priceAllyUSD}
                tasa={settings.tasaVES}
                moneda="USD"
                className="text-3xl font-bold text-gray-900"
              />
            </div>
            <div className="mb-4">
              <Price
                priceUSD={product.priceUSD}
                priceAllyUSD={product.priceAllyUSD}
                tasa={settings.tasaVES}
                moneda="VES"
                className="text-lg text-gray-600 block"
              />
            </div>
            <p className="text-gray-700 leading-relaxed mb-8">
              {product.description || 'Descripción no disponible.'}
            </p>

            {isConfigurable && configurableHref && (
              <div className="mb-6 flex flex-wrap gap-3">
                <a
                  href={configurableHref}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-brand text-white text-sm font-semibold shadow-sm hover:bg-opacity-90 transition-colors"
                >
                  Personalizar este mueble
                </a>
                <a
                  href={configurableHref}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-gray-300 text-sm font-semibold text-gray-800 bg-white hover:bg-gray-50 transition-colors"
                >
                  Personalizar en mi espacio
                </a>
              </div>
            )}

            <ProductActions
              product={{
                ...(product as any),
                priceUSD: product.priceUSD,
                priceAllyUSD: product.priceAllyUSD ?? null,
                avgCost: product.avgCost ?? null,
                lastCost: product.lastCost ?? null,
              }}
              whatsappPhone={(settings as any).whatsappPhone || undefined}
            />

            {Boolean((product as any).showSocialButtons) &&
              (Boolean((settings as any).instagramHandle) ||
                Boolean((settings as any).tiktokHandle)) && (
                <div className="mt-6 flex gap-3">
                  {Boolean((settings as any).instagramHandle) && (
                    <a
                      className="px-4 py-2 rounded bg-pink-600 text-white hover:bg-pink-700"
                      href={`https://www.instagram.com/${String(
                        (settings as any).instagramHandle || '',
                      ).replace(/^@+/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver en Instagram
                    </a>
                  )}
                  {Boolean((settings as any).tiktokHandle) && (
                    <a
                      className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800"
                      href={`https://www.tiktok.com/@${String(
                        (settings as any).tiktokHandle || '',
                      ).replace(/^@+/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver en TikTok
                    </a>
                  )}
                </div>
              )}
          </div>
        </div>

        {relatedProducts && relatedProducts.length > 0 && (
          <>
            <AnimatedTitle>También te puede interesar</AnimatedTitle>
            <RelatedProductsCarousel
              products={relatedProducts as any}
              settings={settings}
            />
          </>
        )}
      </div>
    </>
  );
}
