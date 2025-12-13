"use client";

import { useEffect, useMemo, useState } from 'react';
import { PendingButton } from '@/components/pending-button';

type ProductOption = {
  id: string;
  name: string;
  sku?: string | null;
  priceUSD: number;
};

type Line = ProductOption & { quantity: number };

export default function RootSecretSaleForm({
  action,
  tasaVES,
}: {
  action: (formData: FormData) => void;
  tasaVES: number;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Line[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/root/products/search?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          setResults(json || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const addItem = (product: ProductOption) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.id === product.id);
      if (existing) {
        return prev.map((p) =>
          p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p,
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setQuery('');
    setResults([]);
  };

  const updateQuantity = (id: string, qty: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, qty || 1) } : item,
      ),
    );
  };

  const updatePrice = (id: string, price: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, priceUSD: Math.max(0.01, price) } : item)),
    );
  };

  const remove = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id));

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.priceUSD * item.quantity, 0);
    return {
      subtotal,
      subtotalVES: subtotal * tasaVES,
    };
  }, [items, tasaVES]);

  const itemsPayload = JSON.stringify(
    items.map((item) => ({
      productId: item.id,
      name: item.name,
      priceUSD: item.priceUSD,
      quantity: item.quantity,
    })),
  );

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!items.length) {
          event.preventDefault();
          setError('Debes agregar al menos un producto.');
          return;
        }
        setError('');
      }}
      className="space-y-4"
    >
      <input type="hidden" name="items" value={itemsPayload} />
      <div>
        <label className="block text-sm text-gray-700">Buscar productos (sin IVA)</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre, SKU..."
          className="border rounded px-2 py-1 w-full"
        />
        {loading && <p className="text-xs text-gray-500 mt-1">Buscando…</p>}
        {!!results.length && (
          <div className="mt-2 border rounded divide-y bg-white shadow max-h-56 overflow-y-auto z-20 relative">
            {results.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addItem(product)}
                className="w-full text-left px-2 py-1 hover:bg-slate-50 flex justify-between gap-2 text-sm"
              >
                <div>
                  <div className="font-medium text-gray-900">{product.name}</div>
                  <div className="text-xs text-gray-500">{product.sku || 'Sin SKU'}</div>
                </div>
                <div className="text-right text-xs text-gray-600">${product.priceUSD.toFixed(2)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Producto</th>
              <th className="text-right px-3 py-2">Precio (USD)</th>
              <th className="text-right px-3 py-2">Cantidad</th>
              <th className="text-right px-3 py-2">Subtotal</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                  Agrega productos marcados como “vender sin IVA”.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.sku || 'Sin SKU'}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.priceUSD}
                      onChange={(e) => updatePrice(item.id, Number(e.target.value))}
                      className="w-24 border rounded px-1 py-0.5 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
                      className="w-16 border rounded px-1 py-0.5 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    ${(item.priceUSD * item.quantity).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="text-red-600 text-xs hover:underline"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border rounded p-4">
        <div className="space-y-2">
          <div>
            <label className="block text-sm text-gray-700">Nombre / Razón social</label>
            <input name="customerName" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Teléfono</label>
            <input
              name="customerPhone"
              className="border rounded px-2 py-1 w-full"
              placeholder="0412-0000000"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Cédula / RIF</label>
            <input name="customerTaxId" className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Dirección fiscal</label>
            <textarea name="customerFiscalAddress" className="border rounded px-2 py-1 w-full min-h-[60px]" />
          </div>
        </div>
        <div className="space-y-2">
          <div>
            <label className="block text-sm text-gray-700">Observaciones internas</label>
            <textarea name="observations" className="border rounded px-2 py-1 w-full min-h-[80px]" />
          </div>
          <div className="bg-slate-50 border rounded px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal USD:</span>
              <span className="font-semibold">${totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600 text-xs mt-1">
              <span>Tasa referencia:</span>
              <span>{tasaVES.toFixed(2)} Bs/USD</span>
            </div>
            <div className="flex justify-between text-gray-700 text-sm">
              <span>Total aprox Bs:</span>
              <span className="font-semibold">Bs {totals.subtotalVES.toFixed(2)}</span>
            </div>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <PendingButton
            className="w-full bg-rose-600 text-white py-2 rounded disabled:opacity-60"
            pendingText="Generando nota..."
          >
            Registrar nota sin IVA
          </PendingButton>
        </div>
      </div>
    </form>
  );
}
