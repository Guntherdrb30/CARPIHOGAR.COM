"use client";

import { useEffect, useMemo, useState } from "react";

type PriceMode = "P1" | "P2";

type Prod = { id: string; name: string; sku: string | null; priceUSD: number; priceAllyUSD?: number | null };
type Line = { productId: string; name: string; p1: number; p2?: number | null; priceUSD: number; quantity: number };

export default function QuoteEditForm({ quoteId, ivaPercent, tasaVES, initialItems, initialNotes, initialTaxId, initialFiscalAddress, action, backTo }: {
  quoteId: string;
  ivaPercent: number;
  tasaVES: number;
  initialItems: Line[];
  initialNotes?: string | null;
  initialTaxId?: string | null;
  initialFiscalAddress?: string | null;
  action: (formData: FormData) => void;
  backTo: string;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Prod[]>([]);
  const [items, setItems] = useState<Line[]>(() => initialItems || []);
  const [notes, setNotes] = useState<string>(initialNotes || "");
  const [customerTaxId, setCustomerTaxId] = useState<string>(initialTaxId || "");
  const [customerFiscalAddress, setCustomerFiscalAddress] = useState<string>(initialFiscalAddress || "");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setFound([]); return; }
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
        if (res.ok) setFound(await res.json());
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((a, it) => a + it.priceUSD * it.quantity, 0);
    const iva = subtotal * (Number(ivaPercent) / 100);
    const totalUSD = subtotal + iva;
    const totalVES = totalUSD * Number(tasaVES);
    return { subtotal, iva, totalUSD, totalVES };
  }, [items, ivaPercent, tasaVES]);

  const addItem = (p: Prod, mode: PriceMode = "P1") => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.productId === p.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }; return next; }
      const p1 = Number(p.priceUSD);
      const p2 = p.priceAllyUSD != null ? Number(p.priceAllyUSD) : null;
      const selected = mode === "P2" && p2 != null ? p2 : p1;
      return [...prev, { productId: p.id, name: p.name, p1, p2, priceUSD: selected, quantity: 1 }];
    });
  };

  const updateQty = (id: string, qty: number) => setItems((prev) => prev.map((l) => (l.productId === id ? { ...l, quantity: Math.max(1, qty) } : l)));
  const remove = (id: string) => setItems((prev) => prev.filter((l) => l.productId !== id));

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    setError("");
    if (!items.length) { e.preventDefault(); setError('Debes agregar al menos un producto.'); return; }
    setLoading(true);
  };

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-700">Buscar productos</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, SKU o código" className="border rounded px-2 py-1 w-full" />
        {found.length > 0 && (
          <div className="mt-2 border rounded divide-y">
            {found.map((p) => (
              <div key={p.id} className="flex items-center justify-between w-full px-3 py-2 hover:bg-gray-50 gap-2">
                <span className="flex-1">
                  {p.name} <span className="text-gray-500">({p.sku || '-'})</span>
                  <span className="block text-xs text-gray-500">
                    P1: ${Number(p.priceUSD).toFixed(2)}
                    {p.priceAllyUSD != null ? ` · P2: $${Number(p.priceAllyUSD).toFixed(2)}` : ""}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => addItem(p, "P1")} className="px-2 py-0.5 border rounded text-sm">P1</button>
                  <button type="button" disabled={p.priceAllyUSD == null} onClick={() => addItem(p, "P2")} className="px-2 py-0.5 border rounded text-sm disabled:opacity-50">P2</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white p-3 rounded border">
        <h3 className="font-semibold mb-2">Items del presupuesto</h3>
        {items.length === 0 && <div className="text-sm text-gray-500">Sin items aún</div>}
        {items.length > 0 && (
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-1 text-left">Producto</th>
                <th className="px-2 py-1 text-right">Precio</th>
                <th className="px-2 py-1 text-right">Cant.</th>
                <th className="px-2 py-1 text-right">Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.productId}>
                  <td className="border px-2 py-1">{l.name}</td>
                  <td className="border px-2 py-1 text-right">
                    <select
                      value={l.p2 != null && l.priceUSD === l.p2 ? "P2" : "P1"}
                      onChange={(e) => {
                        const mode = e.target.value as PriceMode;
                        setItems((prev) =>
                          prev.map((x) =>
                            x.productId === l.productId
                              ? {
                                  ...x,
                                  priceUSD:
                                    mode === "P2" && l.p2 != null
                                      ? Number(l.p2)
                                      : Number(l.p1),
                                }
                              : x
                          )
                        );
                      }}
                      className="border rounded px-1 py-0.5"
                    >
                      <option value="P1">P1 ${l.p1.toFixed(2)}</option>
                      <option value="P2" disabled={l.p2 == null}>
                        P2 {l.p2 != null ? `$${Number(l.p2).toFixed(2)}` : "(N/A)"}
                      </option>
                    </select>
                  </td>
                  <td className="border px-2 py-1 text-right">
                    <input type="number" min={1} value={l.quantity} onChange={(e) => updateQty(l.productId, parseInt(e.target.value || '1', 10))} className="w-20 border rounded px-2 py-1 text-right" />
                  </td>
                  <td className="border px-2 py-1 text-right">${(l.priceUSD * l.quantity).toFixed(2)}</td>
                  <td className="border px-2 py-1 text-right"><button type="button" onClick={() => remove(l.productId)} className="text-red-600">Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <input
          type="hidden"
          name="items"
          value={JSON.stringify(items.map(({ productId, name, priceUSD, quantity }) => ({ productId, name, priceUSD, quantity })))}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        <div className="text-sm text-gray-600">IVA: {Number(ivaPercent).toFixed(2)}% • Tasa: {Number(tasaVES).toFixed(2)}</div>
        <div className="md:col-span-2 text-right">
          <div>Subtotal: ${totals.subtotal.toFixed(2)}</div>
          <div>IVA: ${totals.iva.toFixed(2)}</div>
          <div className="font-semibold">Total: ${totals.totalUSD.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm text-gray-700">Cédula / RIF</label>
          <input name="customerTaxId" value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="V-12345678 / J-12345678-9" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm text-gray-700">Dirección fiscal</label>
          <textarea name="customerFiscalAddress" value={customerFiscalAddress} onChange={(e) => setCustomerFiscalAddress(e.target.value)} className="border rounded px-2 py-1 w-full min-h-[60px]" placeholder="Calle, edificio, piso, municipio, estado" />
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-700">Notas</label>
        <textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="Notas para el cliente (opcional)" />
      </div>

      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      <div>
        <button disabled={loading || !items.length} className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-50">Guardar Cambios</button>
      </div>
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="ivaPercent" value={String(ivaPercent)} />
      <input type="hidden" name="tasaVES" value={String(tasaVES)} />
      <input type="hidden" name="backTo" value={backTo} />
    </form>
  );
}
