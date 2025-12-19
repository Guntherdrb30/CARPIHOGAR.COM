"use client";
import React, { useMemo } from "react";
import { useCartStore } from "@/store/cart";

type ExternalCartItem = {
  productId?: string;
  id?: string;
  name?: string;
  priceUSD?: number;
  quantity?: number;
  image?: string;
};

type ExternalCart = {
  items?: ExternalCartItem[];
  totals?: { totalUSD?: number };
};

export default function CartView({
  cart,
  onRelated,
}: {
  cart?: ExternalCart | null;
  onRelated?: () => void;
}) {
  const storeItems = useCartStore((s) => s.items);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);

  const externalItems = Array.isArray(cart?.items) ? cart?.items : null;
  const usingExternal = !!externalItems;
  const items = usingExternal
    ? externalItems!.map((it) => ({
        id: it.productId || it.id || it.name || "item",
        name: it.name || "Producto",
        priceUSD: Number(it.priceUSD || 0),
        quantity: Number(it.quantity || 0),
        image: it.image || "",
      }))
    : storeItems;

  const totalUSD = useMemo(() => {
    if (usingExternal) return Number(cart?.totals?.totalUSD || 0);
    return items.reduce((a, b) => a + (b.priceUSD || 0) * b.quantity, 0);
  }, [usingExternal, cart, items]);

  return (
    <div className="p-2 border rounded-lg bg-white">
      <div className="font-medium mb-2">Tu carrito</div>
      <div className="space-y-2 max-h-64 overflow-auto atlas-scrollbar">
        {items.length === 0 ? (
          <div className="text-sm text-gray-600">Aun no has agregado productos.</div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="flex items-center gap-2">
              <div className="h-10 w-10 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                {it.image ? <img src={it.image} className="w-full h-full object-cover" /> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm">{it.name}</div>
                <div className="text-xs text-gray-600">${(it.priceUSD || 0).toFixed(2)}</div>
              </div>
              {usingExternal ? (
                <div className="text-sm text-gray-700">x{it.quantity}</div>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <button
                      className="px-2 py-1 border rounded text-xs"
                      onClick={async () => {
                        const next = Math.max(0, it.quantity - 1);
                        if (next === 0) removeItem(it.id);
                        else updateQty(it.id, next);
                        try {
                          await fetch("/api/assistant/ui-event", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ key: "update_qty", productId: it.id, qty: next }),
                          });
                        } catch {}
                      }}
                    >
                      -
                    </button>
                    <span className="text-sm w-6 text-center">{it.quantity}</span>
                    <button
                      className="px-2 py-1 border rounded text-xs"
                      onClick={async () => {
                        const next = it.quantity + 1;
                        updateQty(it.id, next);
                        try {
                          await fetch("/api/assistant/ui-event", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ key: "update_qty", productId: it.id, qty: next }),
                          });
                        } catch {}
                      }}
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="px-2 py-1 border rounded text-xs"
                    onClick={async () => {
                      removeItem(it.id);
                      try {
                        await fetch("/api/assistant/ui-event", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ key: "remove_from_cart", productId: it.id }),
                        });
                      } catch {}
                    }}
                  >
                    Eliminar
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <div>Total</div>
        <div className="font-semibold">${totalUSD.toFixed(2)}</div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <a
          href="/checkout/revisar"
          className="flex-1 text-center atlas-button rounded py-2"
          onClick={async (e) => {
            try {
              e.preventDefault();
              await fetch("/api/assistant/ui-event", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: "start_checkout" }),
              });
            } catch {}
            window.location.href = "/checkout/revisar";
          }}
        >
          Proceder a pagar
        </a>
        <button className="px-3 py-2 border rounded text-sm" onClick={onRelated}>
          Ver relacionados
        </button>
      </div>
    </div>
  );
}
