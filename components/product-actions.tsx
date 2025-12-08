'use client';

import { useEffect, useMemo, useState } from 'react';
import { STOCK_POLL_MS } from '@/lib/constants';
import { useCartStore } from '@/store/cart';
import type { Product } from '@prisma/client';
import { toast } from 'sonner';
import {
  FacebookShareButton,
  TwitterShareButton,
  WhatsappShareButton,
  TelegramShareButton,
  FacebookIcon,
  WhatsappIcon,
  TelegramIcon,
} from 'react-share';

export function ProductActions({
  product,
  whatsappPhone,
}: {
  product: Omit<Product, 'priceUSD' | 'stockUnits'> & {
    priceUSD: number;
    stockUnits?: number | null;
  };
  whatsappPhone?: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const [liveStock, setLiveStock] = useState<number | null>(null);
  const stock = useMemo(() => {
    const base =
      typeof product.stockUnits === 'number' &&
      product.stockUnits != null &&
      !isNaN(product.stockUnits)
        ? product.stockUnits
        : product.stock;
    return liveStock ?? base;
  }, [liveStock, product.stock, product.stockUnits]);

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

  const addItem = useCartStore((state) => state.addItem);

  const whatsappNumber = useMemo(() => {
    const raw = (whatsappPhone || process.env.NEXT_PUBLIC_WHATSAPP_PHONE || '').replace(
      /\D+/g,
      '',
    );
    return raw || null;
  }, [whatsappPhone]);

  const handleAddToCart = () => {
    if (stock <= 0) {
      toast.error('Producto agotado');
      return;
    }
    const safeQty = Math.max(1, Math.min(quantity, stock));
    const isConfigurable = Boolean((product as any).isConfigurable);
    addItem(
      {
        id: product.id,
        name: product.name,
        priceUSD: product.priceUSD,
        stock: stock,
        image: (product as any).images?.[0],
        ...(isConfigurable ? { type: 'configurable' as const } : {}),
      },
      safeQty,
    );
    if (safeQty < quantity) {
      toast.info(`Se agregó el máximo disponible (${safeQty})`);
    } else {
      toast.success('Producto agregado');
    }
  };

  const getEnvBaseUrl = () => {
    const fromEnv =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXTAUTH_URL ||
      'https://carpihogar.com';
    return fromEnv.replace(/\/+$/, '');
  };

  const [shareUrl, setShareUrl] = useState<string>(
    `${getEnvBaseUrl()}/productos/${product.slug}`,
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(window.location.href);
    }
  }, [product.slug]);

  const handleWhatsApp = () => {
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
    <>
      <div className="flex items-center gap-4 mb-8">
        <label htmlFor="quantity" className="font-bold">
          Cantidad:
        </label>
        <input
          id="quantity"
          type="number"
          min={1}
          max={Math.max(1, stock)}
          value={quantity}
          onChange={(e) =>
            setQuantity(() => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return 1;
              return Math.max(1, Math.min(n, stock));
            })
          }
          className="w-24 border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand"
          disabled={stock === 0}
        />
        <span className="text-sm text-gray-500">
          {stock > 0 ? `Disponibles: ${stock}` : 'Agotado'}
        </span>
      </div>
      <button
        onClick={handleAddToCart}
        className="w-full bg-brand hover:bg-opacity-90 text-white font-bold text-lg py-3 px-8 rounded-full transition-colors disabled:bg-gray-400"
        disabled={stock === 0}
      >
        {stock > 0 ? 'Agregar al Carrito' : 'Agotado'}
      </button>
      {whatsappNumber && (
        <button
          type="button"
          onClick={handleWhatsApp}
          className="w-full mt-3 bg-[#25D366] hover:bg-[#1ebe57] text-white font-bold text-lg py-3 px-8 rounded-full transition-colors"
        >
          Comprar por WhatsApp
        </button>
      )}
      <div className="mt-8">
        <p className="text-center text-sm font-medium text-gray-600 mb-4">
          ¡Comparte este producto con tus amigos!
        </p>
        <div className="flex flex-col items-center gap-3">
          <div className="flex justify-center gap-4">
            <FacebookShareButton url={shareUrl} title={product.name}>
              <FacebookIcon size={42} round />
            </FacebookShareButton>
            <TwitterShareButton url={shareUrl} title={product.name}>
              <div
                aria-label="Compartir en X"
                className="h-[42px] w-[42px] rounded-full bg-black text-white flex items-center justify-center text-sm font-semibold"
              >
                X
              </div>
            </TwitterShareButton>
            <WhatsappShareButton url={shareUrl} title={product.name} separator=":: ">
              <WhatsappIcon size={42} round />
            </WhatsappShareButton>
            <TelegramShareButton url={shareUrl} title={product.name}>
              <TelegramIcon size={42} round />
            </TelegramShareButton>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!shareUrl) return;
              try {
                if (
                  typeof navigator !== 'undefined' &&
                  navigator.clipboard &&
                  navigator.clipboard.writeText
                ) {
                  await navigator.clipboard.writeText(shareUrl);
                  toast.success('Enlace copiado al portapapeles.');
                } else {
                  toast.info(`Copia este enlace: ${shareUrl}`);
                }
              } catch {
                toast.error('No se pudo copiar el enlace.');
              }
            }}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Copiar URL
          </button>
        </div>
      </div>
    </>
  );
}
