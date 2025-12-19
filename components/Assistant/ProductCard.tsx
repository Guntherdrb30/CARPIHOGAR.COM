"use client";
import React from "react";
import { useCartStore } from "@/store/cart";
import { useRouter } from "next/navigation";
import { useAssistantCtx } from "./AssistantProvider";
import { toast } from "sonner";
import { track } from "@vercel/analytics/react";

type Product = {
  id: string;
  name: string;
  slug: string;
  images?: string[];
  priceUSD?: number;
  sku?: string | null;
  code?: string | null;
};

export default function ProductCard({
  p,
  onAdd,
}: {
  p: Product;
  onAdd?: (p: Product) => void;
}) {
  const addItem = useCartStore((s) => s.addItem);
  const img = (p.images && p.images[0]) || "";
  const price = typeof p.priceUSD === "number" ? p.priceUSD : undefined;
  const router = useRouter();
  const a = useAssistantCtx();
  const productCode = p.code || p.sku || "";

  const addToCart = async () => {
    try {
      addItem(
        { id: p.id, name: p.name, priceUSD: price || 0, image: img, sku: p.sku || p.code || p.slug },
        1,
      );
    } catch {}
    try {
      await fetch("/api/assistant/ui-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "add_to_cart", productId: p.id, qty: 1 }),
      });
    } catch {}
    try {
      track("assistant_add_to_cart", {
        source: "assistant_panel",
        product_id: p.id,
        product_slug: p.slug,
      });
    } catch {}
    try {
      toast.success(`Se agrego "${p.name}" al carrito`);
    } catch {}
    try {
      a.append({
        id: crypto.randomUUID(),
        from: "agent",
        at: Date.now(),
        content: {
          type: "text",
          message: `Se agrego "${p.name}" al carrito.`,
          actions: [{ key: "view_cart", label: "Ver carrito" }],
        },
      } as any);
    } catch {}
    onAdd?.(p);
  };

  const openProduct = () => {
    const url = `/productos/${p.slug}`;
    router.push(url);
  };

  return (
    <div className="flex items-center gap-2 p-2 border rounded-lg bg-white">
      <button
        onClick={openProduct}
        className="h-14 w-14 bg-gray-100 rounded overflow-hidden flex-shrink-0"
      >
        {img ? <img src={img} alt={p.name} className="w-full h-full object-cover" /> : null}
      </button>
      <button onClick={openProduct} className="flex-1 min-w-0 text-left">
        <div className="truncate text-sm font-medium hover:underline cursor-pointer">
          {p.name}
        </div>
        {productCode ? (
          <div className="text-[11px] text-gray-500">Codigo: {productCode}</div>
        ) : null}
        {typeof price === "number" ? (
          <div className="text-xs text-gray-600">${price.toFixed(2)}</div>
        ) : null}
      </button>
      <button className="px-3 py-1 rounded atlas-button text-sm" onClick={addToCart}>
        Agregar
      </button>
    </div>
  );
}
