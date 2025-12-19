'use client';

import { useEffect, useState } from 'react';
import { STOCK_POLL_MS } from '@/lib/constants';
import { useCartStore } from '@/store/cart';
import Price from '@/components/price';
import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/confirm-dialog';

export default function Cart({ tasa }: { tasa: number }) {
  const { items, updateQty, removeItem, clearCart, getTotalUSD, refreshStocks } =
    useCartStore();
  const [moneda, setMoneda] = useState<'USD' | 'VES'>('USD');
  const [syncInfo, setSyncInfo] = useState<{
    removed: string[];
    adjusted: Array<{ id: string; from: number; to: number }>;
  } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [proceedHref, setProceedHref] =
    useState<string>('/checkout/datos-envio');

  useEffect(() => {
    let cancelled = false;
    const doSync = async () => {
      const res = await refreshStocks({ currency: moneda, includePrices: true });
      if (!cancelled) setSyncInfo(res);
    };
    doSync();
    const t = setInterval(doSync, STOCK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [refreshStocks, moneda]);

  // Decide next step: if user logged in and already has an address, jump to revisar con transferencia
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/location', {
          credentials: 'include',
        });
        if (!res.ok) return; // not logged in or error
        const json = await res.json();
        if (!cancelled && json?.hasAddress) {
          setProceedHref('/checkout/revisar?metodo=TRANSFERENCIA');
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = getTotalUSD();

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-4xl font-bold mb-4">Tu carrito esta vacio</h1>
        <p className="text-gray-600 mb-8">
          Parece que no has agregado nada a tu carrito todavia.
        </p>
        <Link
          href="/productos"
          className="bg-brand hover:bg-opacity-90 text-white font-bold py-3 px-6 rounded-full transition-colors"
        >
          Ver productos
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-8">Tu Carrito</h1>
      {syncInfo &&
        (syncInfo.removed.length > 0 || syncInfo.adjusted.length > 0) && (
          <div className="mb-4 border border-yellow-300 bg-yellow-50 text-yellow-800 px-3 py-2 rounded text-sm">
            {syncInfo.removed.length > 0 && (
              <div>Se removieron productos agotados del carrito.</div>
            )}
            {syncInfo.adjusted.length > 0 && (
              <div>
                Algunas cantidades se ajustaron al stock disponible.
              </div>
            )}
          </div>
        )}

      {/* Actions */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setConfirmOpen(true)}
          className="text-sm px-3 py-2 border border-red-500 text-red-600 rounded"
        >
          Vaciar carrito
        </button>
        <select
          value={moneda}
          onChange={(e) => setMoneda(e.target.value as 'USD' | 'VES')}
          className="border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand"
        >
          <option value="USD">USD</option>
          <option value="VES">VES</option>
        </select>
      </div>

      {/* Cart Items Table */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-4 font-bold">Producto</th>
              <th className="p-4 font-bold">Precio</th>
              <th className="p-4 font-bold">Cantidad</th>
              <th className="p-4 font-bold text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const cfg = item.config as any;
              const isConfigurable = item.type === 'configurable' && cfg;
              const dims = cfg?.dimensions;
              const aesth = cfg?.aesthetics;

              return (
                <tr key={item.id} className="border-b">
                  <td className="p-4 align-top">
                    <div className="font-medium">{item.name}</div>
                    {isConfigurable && (
                      <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                        {dims && (
                          <div>
                            Dimensiones:{' '}
                            {dims.width} × {dims.depth} × {dims.height} cm
                          </div>
                        )}
                        {aesth && (
                          <div>
                            Color: {aesth.colors}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    <Price priceUSD={item.priceUSD} tasa={tasa} moneda={moneda} />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        aria-label="Disminuir"
                        onClick={() => {
                          const next = item.quantity - 1;
                          if (next <= 0) {
                            removeItem(item.id);
                            toast.success('Producto eliminado del carrito');
                          } else {
                            updateQty(item.id, next);
                            toast.info(`Cantidad actualizada a ${next}`);
                          }
                        }}
                        className="p-1 rounded border hover:bg-gray-50"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, item.stock ?? 1)}
                        value={item.quantity}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          const max =
                            typeof item.stock === 'number'
                              ? item.stock
                              : Infinity;
                          if (!isFinite(v) || isNaN(v)) return;
                          if (v < 1) {
                            removeItem(item.id);
                            toast.success(
                              'Producto eliminado del carrito',
                            );
                            return;
                          }
                          if (v > (max as number)) {
                            updateQty(item.id, max as number);
                            toast.warning(
                              `Stock maximo disponible: ${max}`,
                            );
                            return;
                          }
                          updateQty(item.id, v);
                          toast.info(`Cantidad actualizada a ${v}`);
                        }}
                        className="w-20 border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand text-center"
                      />
                      <button
                        aria-label="Aumentar"
                        onClick={() => {
                          const max =
                            typeof item.stock === 'number'
                              ? item.stock
                              : Infinity;
                          if (item.quantity >= (max as number)) {
                            toast.warning(
                              `Stock maximo disponible: ${max}`,
                            );
                            return;
                          }
                          const next = item.quantity + 1;
                          updateQty(item.id, next);
                          toast.info(
                            `Cantidad actualizada a ${next}`,
                          );
                        }}
                        className="p-1 rounded border hover:bg-gray-50"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() => {
                          removeItem(item.id);
                          toast.success('Producto eliminado del carrito');
                        }}
                        className="ml-2 p-1 rounded border hover:bg-gray-50 text-red-600"
                        aria-label="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {(item.stock ?? Infinity) === Infinity
                        ? ''
                        : `Stock: ${item.stock}`}
                    </div>
                  </td>
                  <td className="p-4 text-right align-top">
                    <Price
                      priceUSD={item.priceUSD * item.quantity}
                      tasa={tasa}
                      moneda={moneda}
                      className="font-bold"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cart Total */}
      <div className="flex justify-end mt-8">
        <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm">
          <h2 className="text-2xl font-bold mb-4">Total del Carrito</h2>
          <div className="flex justify-between items-center">
            <span className="text-lg">Total ({moneda})</span>
            <Price
              priceUSD={total}
              tasa={tasa}
              moneda={moneda}
              className="text-2xl font-bold text-brand"
            />
          </div>
          <Link
            href={proceedHref}
            className="mt-6 w-full bg-brand hover:bg-opacity-90 text-white font-bold py-3 rounded-full transition-colors text-center block"
          >
            Proceder al Pago
          </Link>
        </div>
      </div>

      {/* Confirm clear cart modal */}
      <ConfirmDialog
        open={confirmOpen}
        title="Vaciar carrito"
        message="Esta accion vaciara todos los productos del carrito."
        confirmText="Si, vaciar"
        cancelText="Cancelar"
        onConfirm={() => {
          clearCart();
          setConfirmOpen(false);
          toast.success('Carrito vaciado');
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
