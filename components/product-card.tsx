'use client';

import Link from 'next/link';
import Price from '@/components/price';
import type { Product } from '@prisma/client';
import WishlistButton from './wishlist-button';
import { useEffect, useMemo, useState } from 'react';
import { STOCK_POLL_MS } from '@/lib/constants';
import { useCartStore } from '@/store/cart';
import { toast } from 'sonner';
import React from 'react';

type ProductWithCategory = Product & {
  category: {
    name: string;
  } | null;
};

const ProductCard = ({
  product,
  tasa,
  isWishlisted = false,
  compact = false,
  whatsappPhone,
}: {
  product: ProductWithCategory;
  tasa: number;
  isWishlisted?: boolean;
  compact?: boolean;
  whatsappPhone?: string;
}) => {
  const isConfigurable = Boolean((product as any).isConfigurable);
  const [liveStock, setLiveStock] = useState<number | null>(null);
  const stock = useMemo(() => {
    const base =
      typeof (product as any).stockUnits === 'number' &&
      (product as any).stockUnits != null &&
      !isNaN((product as any).stockUnits)
        ? (product as any).stockUnits
        : product.stock;
    return liveStock ?? base;
  }, [liveStock, product.stock, (product as any).stockUnits]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/stock?ids=${encodeURIComponent(product.id)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const data = await res.json();
        const s = Number(data?.stocks?.[product.id] ?? NaN);
        if (!isNaN(s) && !cancelled) setLiveStock(s);
      } catch {}
    };
    poll();
    const t = setInterval(poll, STOCK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [product.id]);

  const addItem = useCartStore((s) => s.addItem);

  const whatsappNumber = useMemo(() => {
    const raw = (whatsappPhone || process.env.NEXT_PUBLIC_WHATSAPP_PHONE || '').replace(
      /\D+/g,
      '',
    );
    return raw || null;
  }, [whatsappPhone]);

  const onAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (stock <= 0) {
      toast.error('Producto agotado');
      return;
    }
    addItem(
      {
        id: product.id,
        name: product.name,
        priceUSD: product.priceUSD,
        stock,
        image: (product as any).images?.[0],
      },
      1,
    );
    toast.success('Producto agregado al carrito');
  };

  const onWhatsAppClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!whatsappNumber) return;
    let baseUrl = '';
    if (typeof window !== 'undefined') {
      baseUrl = window.location.origin;
    }
    const encodedSlug = encodeURIComponent(String(product.slug || ''));
    const productUrl = baseUrl ? `${baseUrl}/productos/${encodedSlug}` : '';
    const text = `Hola, estoy interesado en el producto "${product.name}"${
      productUrl ? ` (${productUrl})` : ''
    }. ¿Me puedes dar más información y opciones de compra?`;
    const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
    if (typeof window !== 'undefined') {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className={`relative bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow group ${
        compact ? 'text-sm' : ''
      }`}
    >
      <WishlistButton productId={product.id} isInitiallyWishlisted={isWishlisted} />
      <Link href={`/productos/${product.slug}`}>
        <div className={`relative w-full overflow-hidden ${compact ? 'h-44' : 'h-72'}`}>
          <div
            style={{
              backgroundImage: `url(${
                product.images[0] || 'https://via.placeholder.com/400'
              })`,
            }}
            className={`bg-gray-200 h-full w-full bg-cover bg-center transition-transform duration-300 group-hover:scale-105 ${
              stock <= 0 ? 'opacity-60' : ''
            }`}
          ></div>
          {stock <= 0 && (
            <div className="absolute top-2 left-2 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded">
              Agotado
            </div>
          )}
        </div>
      </Link>
      <div className={`${compact ? 'p-3' : 'p-4'}`}>
        <Link href={`/productos/${product.slug}`} className="block">
          <h3
            className={`${
              compact ? 'text-sm' : 'text-lg'
            } font-bold text-gray-800 truncate`}
          >
            {product.name}
          </h3>
        </Link>
        {isConfigurable && (
          <div className="mt-1 space-y-1">
            <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold">
              Mueble personalizado
            </span>
            <p className="text-[11px] text-gray-600 leading-snug">
              Los muebles personalizados se entregan entre 10 y 15 días después de la compra. Si el tiempo fuera mayor por cantidad de pedidos, te contactaremos por WhatsApp para informarte la fecha de envío.
            </p>
          </div>
        )}
        <div className="mt-2">
          <Price
            priceUSD={product.priceUSD}
            tasa={tasa}
            moneda="USD"
            className={`${compact ? 'text-base' : 'text-xl'} font-bold text-gray-900`}
          />
          <Price
            priceUSD={product.priceUSD}
            tasa={tasa}
            moneda="VES"
            className={`${compact ? 'text-xs' : 'text-sm'} text-gray-600 block`}
          />
        </div>
        <button
          onClick={onAddToCart}
          disabled={stock <= 0}
          className={`mt-3 w-full rounded-md ${
            compact ? 'py-1 text-xs' : 'py-2 text-sm'
          } font-semibold ${
            stock > 0
              ? 'bg-brand text-white hover:bg-opacity-90'
              : 'bg-gray-300 text-gray-600 cursor-not-allowed'
          }`}
        >
          {stock > 0 ? 'Agregar al Carrito' : 'Agotado'}
        </button>
        {whatsappNumber && (
          <button
            onClick={onWhatsAppClick}
            className={`mt-2 w-full rounded-md ${
              compact ? 'py-1 text-xs' : 'py-2 text-sm'
            } font-semibold flex items-center justify-center gap-2 bg-[#25D366] text-white hover:bg-[#1ebe57]`}
          >
            Comprar por WhatsApp
          </button>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
