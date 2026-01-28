"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ProdSearch = {
  id: string;
  name: string;
  sku: string | null;
  priceUSD: number | null;
};

type Margins = {
  client: number;
  ally: number;
  wholesale: number;
};

type PurchaseRow = {
  id: string;
  productId?: string | null;
  code: string;
  name: string;
  quantity: number;
  unitCostInput: string; // Valor ingresado en moneda de factura
  costUSD: number; // Convertido a USD según moneda/tasa
  marginClientPct: number;
  marginAllyPct: number;
  marginWholesalePct: number;
  supplierCode?: string | null;
  description?: string | null;
  weightKg?: number | null;
  soldBy?: "UNIT" | "PACKAGE" | "BOTH" | null;
  unitsPerPackage?: number | null;
  status?: "ACTIVE" | "REVIEW";
  source: "EXISTING" | "NEW";
  selected: boolean;
};

const randomId = () => Math.random().toString(36).slice(2, 9);
const toMoney = (n: number) => Number(n || 0).toFixed(2);

export default function PurchasePreviewTable({
  supplierId,
  currency,
  tasaVES,
  invoiceNumber,
  invoiceDate,
  invoiceImageUrl,
  defaultIvaPercent,
  paymentCurrency,
  bankAccountId,
  paymentReference,
  notes,
  defaultMargins,
  paymentMode: paymentModeProp = "CONTADO",
  onPaymentModeChange,
}: {
  supplierId?: string;
  currency: "USD" | "VES";
  tasaVES?: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceImageUrl?: string;
  defaultIvaPercent: number;
  paymentCurrency: "USD" | "VES" | "USDT";
  bankAccountId?: string;
  paymentReference?: string;
  notes?: string;
  defaultMargins: Margins;
  paymentMode?: "CONTADO" | "CREDITO_SIN_ABONO" | "CREDITO_CON_ABONO";
  onPaymentModeChange?: (
    mode: "CONTADO" | "CREDITO_SIN_ABONO" | "CREDITO_CON_ABONO",
  ) => void;
}) {
  const rate = currency === "VES" ? Number(tasaVES || 0) : 1;
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [searchQ, setSearchQ] = useState<string>("");
  const [searchResults, setSearchResults] = useState<ProdSearch[]>([]);
  const [newCode, setNewCode] = useState<string>("");
  const [newName, setNewName] = useState<string>("");
  const [newQuantity, setNewQuantity] = useState<number>(1);
  const [newUnitCost, setNewUnitCost] = useState<string>("");
  const [newUnitsPerPackage, setNewUnitsPerPackage] = useState<string>("");
  const [newSoldBy, setNewSoldBy] = useState<"UNIT" | "PACKAGE" | "BOTH">(
    "UNIT",
  );
  const [newWeightKg, setNewWeightKg] = useState<string>("");
  const [markReview, setMarkReview] = useState<boolean>(false);

  const [baseEdited, setBaseEdited] = useState(false);
  const [baseAmountCurrency, setBaseAmountCurrency] = useState<number>(0);
  const [discountAmountCurrency, setDiscountAmountCurrency] =
    useState<number>(0);
  const [ivaPercent, setIvaPercent] = useState<number>(defaultIvaPercent || 16);
  const [ivaManual, setIvaManual] = useState<boolean>(false);
  const [ivaAmountCurrency, setIvaAmountCurrency] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<
    "CONTADO" | "CREDITO_SIN_ABONO" | "CREDITO_CON_ABONO"
  >(paymentModeProp);
  useEffect(() => {
    if (paymentModeProp !== paymentMode) {
      setPaymentMode(paymentModeProp);
    }
  }, [paymentModeProp, paymentMode]);
  const handlePaymentModeChange = (
    mode: "CONTADO" | "CREDITO_SIN_ABONO" | "CREDITO_CON_ABONO",
  ) => {
    setPaymentMode(mode);
    onPaymentModeChange?.(mode);
  };
  const [paidAmountUSD, setPaidAmountUSD] = useState<number | "">("");
  const [igtfAmountManualUSD, setIgtfAmountManualUSD] = useState<number>(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = searchQ.trim();
      if (!q) {
        setSearchResults([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/products/search?q=${encodeURIComponent(q)}`,
          { credentials: "include" },
        );
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json)) {
          setSearchResults(
            json.map((p: any) => ({
              id: String(p.id),
              name: String(p.name || ""),
              sku: (p.sku as string | null) ?? null,
              priceUSD:
                typeof p.priceUSD === "number"
                  ? p.priceUSD
                  : Number(p.priceUSD || 0),
            })),
          );
        }
      } catch {
        // ignore search errors
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  // Recalcular costos en USD si cambia la tasa o moneda
  useEffect(() => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        costUSD: computeCostUSD(r.unitCostInput),
      })),
    );
  }, [currency, tasaVES]);

  const computeCostUSD = (value: string) => {
    const parsed = Number((value || "").toString().replace(",", "."));
    if (isNaN(parsed) || parsed < 0) return 0;
    if (currency === "VES") {
      return rate > 0 ? parsed / rate : 0;
    }
    return parsed;
  };
  const addRow = (row: Omit<PurchaseRow, "id">) => {
    setRows((prev) => [...prev, { ...row, id: randomId() }]);
  };

  const addExistingProduct = (p: ProdSearch) => {
    const margins = {
      client: Number(defaultMargins.client || 40),
      ally: Number(defaultMargins.ally || 30),
      wholesale: Number(defaultMargins.wholesale || 20),
    };
    addRow({
      productId: p.id,
      code: p.sku || "",
      name: p.name,
      quantity: 1,
      unitCostInput: "",
      costUSD: 0,
      marginClientPct: margins.client,
      marginAllyPct: margins.ally,
      marginWholesalePct: margins.wholesale,
      supplierCode: null,
      description: null,
      weightKg: null,
      soldBy: "UNIT",
      unitsPerPackage: null,
      status: undefined,
      source: "EXISTING",
      selected: true,
    });
    setSearchQ("");
    setSearchResults([]);
  };

  const addManualProduct = () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Escribe el nombre del producto");
      return;
    }
    if (!newUnitCost.trim()) {
      toast.error("Ingresa el precio unitario de la factura");
      return;
    }
    const margins = {
      client: Number(defaultMargins.client || 40),
      ally: Number(defaultMargins.ally || 30),
      wholesale: Number(defaultMargins.wholesale || 20),
    };
    addRow({
      productId: null,
      code: newCode.trim(),
      name,
      quantity: Math.max(1, newQuantity || 1),
      unitCostInput: newUnitCost,
      costUSD: computeCostUSD(newUnitCost),
      marginClientPct: margins.client,
      marginAllyPct: margins.ally,
      marginWholesalePct: margins.wholesale,
      supplierCode: null,
      description: null,
      weightKg: newWeightKg ? Number(newWeightKg) : null,
      soldBy: newSoldBy,
      unitsPerPackage: newUnitsPerPackage
        ? Number(newUnitsPerPackage)
        : null,
      status: markReview ? "REVIEW" : "ACTIVE",
      source: "NEW",
      selected: true,
    });
    setNewCode("");
    setNewName("");
    setNewQuantity(1);
    setNewUnitCost("");
    setNewUnitsPerPackage("");
    setNewSoldBy("UNIT");
    setNewWeightKg("");
    setMarkReview(false);
  };

  const updateRow = (id: string, patch: Partial<PurchaseRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next: PurchaseRow = { ...r, ...patch };
        if ("unitCostInput" in patch) {
          next.costUSD = computeCostUSD(patch.unitCostInput as any);
        }
        if ("marginClientPct" in patch || "costUSD" in patch) {
          next.marginClientPct = Number(next.marginClientPct || 0);
        }
        if ("marginAllyPct" in patch || "costUSD" in patch) {
          next.marginAllyPct = Number(next.marginAllyPct || 0);
        }
        if ("marginWholesalePct" in patch || "costUSD" in patch) {
          next.marginWholesalePct = Number(next.marginWholesalePct || 0);
        }
        return next;
      }),
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const selectedRows = useMemo(
    () => rows.filter((r) => r.selected),
    [rows],
  );

  const baseFromItemsUSD = useMemo(
    () =>
      selectedRows.reduce(
        (acc, r) => acc + Number(r.quantity || 0) * Number(r.costUSD || 0),
        0,
      ),
    [selectedRows],
  );

  const baseFromItemsCurrency =
    currency === "VES" ? baseFromItemsUSD * rate : baseFromItemsUSD;

  useEffect(() => {
    if (!baseEdited) {
      setBaseAmountCurrency(Number(baseFromItemsCurrency.toFixed(2)));
    }
  }, [baseFromItemsCurrency, baseEdited]);

  useEffect(() => {
    if (!ivaManual) {
      const taxable = Math.max(
        0,
        (baseEdited ? baseAmountCurrency : baseFromItemsCurrency) -
          discountAmountCurrency,
      );
      setIvaAmountCurrency(
        Number(((taxable * ivaPercent) / 100).toFixed(2)),
      );
    }
  }, [
    baseAmountCurrency,
    baseEdited,
    baseFromItemsCurrency,
    discountAmountCurrency,
    ivaManual,
    ivaPercent,
  ]);

  const taxableBaseCurrency = useMemo(() => {
    const base = baseEdited ? baseAmountCurrency : baseFromItemsCurrency;
    return Number(Math.max(0, base - discountAmountCurrency).toFixed(2));
  }, [baseAmountCurrency, baseEdited, baseFromItemsCurrency, discountAmountCurrency]);

  const totalInvoiceCurrency = useMemo(
    () =>
      Number((taxableBaseCurrency + Number(ivaAmountCurrency || 0)).toFixed(2)),
    [taxableBaseCurrency, ivaAmountCurrency],
  );

  const baseAmountUSD =
    currency === "VES" ? (rate > 0 ? baseAmountCurrency / rate : 0) : baseAmountCurrency;
  const discountAmountUSD =
    currency === "VES"
      ? rate > 0
        ? discountAmountCurrency / rate
        : 0
      : discountAmountCurrency;
  const ivaAmountUSD =
    currency === "VES"
      ? rate > 0
        ? ivaAmountCurrency / rate
        : 0
      : ivaAmountCurrency;
  const totalInvoiceUSD =
    currency === "VES"
      ? rate > 0
        ? totalInvoiceCurrency / rate
        : 0
      : totalInvoiceCurrency;

  const totals = useMemo(() => {
    const qty = selectedRows.reduce(
      (acc, r) => acc + Number(r.quantity || 0),
      0,
    );
    return { qty, costUSD: baseFromItemsUSD };
  }, [selectedRows, baseFromItemsUSD]);

  const igtfAmountUSD = useMemo(
    () => (paymentCurrency === "USD" ? Number(igtfAmountManualUSD || 0) : 0),
    [paymentCurrency, igtfAmountManualUSD],
  );
  const save = async () => {
    if (!supplierId) {
      toast.error("Selecciona un proveedor");
      return;
    }
    if (!invoiceNumber) {
      toast.error("Ingresa el número de factura");
      return;
    }
    if (currency === "VES" && rate <= 0) {
      toast.error("Coloca la tasa VES/USD de la factura");
      return;
    }
    if (!selectedRows.length) {
      toast.error("Agrega al menos un producto");
      return;
    }
    for (const r of selectedRows) {
      if (!r.name.trim()) {
        toast.error("Un producto no tiene nombre");
        return;
      }
      if (Number(r.quantity) <= 0) {
        toast.error(`Cantidad inválida en ${r.name}`);
        return;
      }
      if (!r.unitCostInput.trim() || Number(r.costUSD) <= 0) {
        toast.error(`Coloca el precio unitario de ${r.name}`);
        return;
      }
    }

    const paid =
      paymentMode === "CONTADO"
        ? totalInvoiceUSD
        : paymentMode === "CREDITO_CON_ABONO" &&
            typeof paidAmountUSD === "number"
          ? Math.max(0, Math.min(totalInvoiceUSD, paidAmountUSD))
          : 0;

    const discountPercent =
      baseAmountUSD > 0
        ? Number(((discountAmountUSD / baseAmountUSD) * 100).toFixed(2))
        : 0;

    const payload = {
      supplierId: supplierId || null,
      currency,
      tasaVES: tasaVES || 0,
      invoiceNumber: invoiceNumber || null,
      invoiceDate: invoiceDate || null,
      invoiceImageUrl: invoiceImageUrl || null,
      baseAmountUSD: Number(baseAmountUSD.toFixed(2)),
      discountAmountUSD: Number(discountAmountUSD.toFixed(2)),
      discountPercent,
      ivaPercent: Number(ivaPercent || 0),
      ivaAmountUSD: Number(ivaAmountUSD.toFixed(2)),
      totalInvoiceUSD: Number(totalInvoiceUSD.toFixed(2)),
      itemsCount: selectedRows.length,
      paymentCurrency: paymentCurrency || currency,
      bankAccountId: bankAccountId || null,
      paymentReference: paymentReference || null,
      igtfPercent: 0,
      igtfAmountUSD,
      paymentMode,
      paidAmountUSD: paid,
      notes: notes || undefined,
      items: selectedRows.map((r) => ({
        productId: r.productId || null,
        code: r.code || null,
        name: r.name,
        quantity: Number(r.quantity || 0),
        costUSD: Number(r.costUSD || 0),
        marginClientPct: Number(r.marginClientPct || 0),
        marginAllyPct: Number(r.marginAllyPct || 0),
        marginWholesalePct: Number(r.marginWholesalePct || 0),
        supplierCode: r.supplierCode || null,
        description: r.description || null,
        weightKg:
          typeof r.weightKg === "number" && !isNaN(r.weightKg)
            ? r.weightKg
            : null,
        soldBy: r.soldBy || null,
        unitsPerPackage:
          typeof r.unitsPerPackage === "number" && !isNaN(r.unitsPerPackage)
            ? r.unitsPerPackage
            : null,
        status: r.status || undefined,
      })),
    };

    try {
      const res = await fetch("/api/purchases/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error");
      toast.success("Entrada guardada");
      window.location.href =
        "/dashboard/admin/compras?message=Entrada%20registrada";
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar la entrada");
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="text-sm font-semibold">
          Buscar producto existente
        </div>
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Buscar por nombre o código"
          className="w-full border rounded px-2 py-1 text-sm"
        />
        {searchResults.length > 0 && (
          <div className="border rounded bg-white divide-y max-h-64 overflow-auto text-sm">
            {searchResults.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-2 py-1 hover:bg-gray-50 flex justify-between"
                onClick={() => addExistingProduct(p)}
              >
                <span>
                  {p.name}{" "}
                  <span className="text-gray-500">
                    ({p.sku || "sin código"})
                  </span>
                </span>
                <span className="text-gray-600">
                  ${toMoney(Number(p.priceUSD || 0))}
                </span>
              </button>
            ))}
          </div>
        )}
        {searchQ.trim() && searchResults.length === 0 && (
          <div className="text-xs text-gray-600">
            Sin resultados. Puedes crearlo abajo.
          </div>
        )}
      </div>

      <div className="space-y-2 border rounded p-3 bg-gray-50">
        <div className="text-sm font-semibold">Crear producto nuevo</div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-600">Nombre</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="border rounded px-2 py-1 w-full"
              placeholder="Nombre del producto"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">
              Código / SKU
            </label>
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="border rounded px-2 py-1 w-full"
              placeholder="Opcional"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">Cantidad</label>
            <input
              type="number"
              min={1}
              value={newQuantity}
              onChange={(e) =>
                setNewQuantity(
                  Math.max(1, parseInt(e.target.value || "1", 10)),
                )
              }
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">
              Precio unitario ({currency})
            </label>
            <input
              value={newUnitCost}
              onChange={(e) => setNewUnitCost(e.target.value)}
              className="border rounded px-2 py-1 w-full"
              placeholder="Costo en la factura"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">
              Unidades por paquete
            </label>
            <input
              value={newUnitsPerPackage}
              onChange={(e) => setNewUnitsPerPackage(e.target.value)}
              className="border rounded px-2 py-1 w-full"
              placeholder="Opcional"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">Unidad</label>
            <select
              value={newSoldBy}
              onChange={(e) => setNewSoldBy(e.target.value as any)}
              className="border rounded px-2 py-1 w-full"
            >
              <option value="UNIT">Pieza</option>
              <option value="PACKAGE">Paquete/Caja</option>
              <option value="BOTH">Ambos</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600">
              Peso (kg)
            </label>
            <input
              value={newWeightKg}
              onChange={(e) => setNewWeightKg(e.target.value)}
              className="border rounded px-2 py-1 w-full"
              placeholder="Opcional"
            />
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={markReview}
                onChange={(e) => setMarkReview(e.target.checked)}
              />
              <span>Marcar como pendiente (REVISIÓN)</span>
            </label>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={addManualProduct}
              className="w-full bg-green-600 text-white px-3 py-1 rounded"
            >
              Agregar a la factura
            </button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto border rounded">
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-2 py-1"></th>
              <th className="px-2 py-1 text-left">Producto</th>
              <th className="px-2 py-1">Cantidad</th>
              <th className="px-2 py-1">
                Precio unitario ({currency})
              </th>
              <th className="px-2 py-1">
                Total ({currency})
              </th>
              <th className="px-2 py-1">% Cliente</th>
              <th className="px-2 py-1">% Aliado</th>
              <th className="px-2 py-1">% Mayor</th>
              <th className="px-2 py-1">Precio cliente USD</th>
              <th className="px-2 py-1">Precio aliado USD</th>
              <th className="px-2 py-1">Precio mayor USD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const priceClientUSD =
                Number(r.costUSD || 0) *
                (1 + Number(r.marginClientPct || 0) / 100);
              const priceAllyUSD =
                Number(r.costUSD || 0) *
                (1 + Number(r.marginAllyPct || 0) / 100);
              const priceWholesaleUSD =
                Number(r.costUSD || 0) *
                (1 + Number(r.marginWholesalePct || 0) / 100);
              const lineTotalCurrency =
                Number(r.quantity || 0) *
                Number(
                  (r.unitCostInput || "0").toString().replace(",", "."),
                );
              return (
                <tr key={r.id}>
                  <td className="border px-2 py-1 text-center space-y-1">
                    <input
                      type="checkbox"
                      checked={r.selected}
                      onChange={(e) =>
                        updateRow(r.id, { selected: e.target.checked })
                      }
                    />
                    <div>
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        className="text-xs text-red-600"
                      >
                        Quitar
                      </button>
                    </div>
                  </td>
                  <td className="border px-2 py-1">
                    <div className="font-medium">
                      <input
                        value={r.name}
                        onChange={(e) =>
                          updateRow(r.id, { name: e.target.value })
                        }
                        className="w-full border rounded px-1 py-0.5 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-1 text-[11px] text-gray-700 mt-1">
                      <input
                        value={r.code}
                        onChange={(e) =>
                          updateRow(r.id, { code: e.target.value })
                        }
                        placeholder="Código/SKU"
                        className="border rounded px-1 py-0.5"
                      />
                      <input
                        value={r.supplierCode || ""}
                        onChange={(e) =>
                          updateRow(r.id, {
                            supplierCode: e.target.value || null,
                          })
                        }
                        placeholder="Código prov."
                        className="border rounded px-1 py-0.5"
                      />
                      <input
                        value={
                          typeof r.unitsPerPackage === "number"
                            ? r.unitsPerPackage
                            : ""
                        }
                        onChange={(e) =>
                          updateRow(r.id, {
                            unitsPerPackage:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                        placeholder="Unidades pack"
                        className="border rounded px-1 py-0.5"
                      />
                      <select
                        value={r.soldBy || "UNIT"}
                        onChange={(e) =>
                          updateRow(r.id, { soldBy: e.target.value as any })
                        }
                        className="border rounded px-1 py-0.5"
                      >
                        <option value="UNIT">Pieza</option>
                        <option value="PACKAGE">Paquete</option>
                        <option value="BOTH">Ambos</option>
                      </select>
                      <input
                        value={
                          typeof r.weightKg === "number" ? r.weightKg : ""
                        }
                        onChange={(e) =>
                          updateRow(r.id, {
                            weightKg:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                        placeholder="Peso kg"
                        className="border rounded px-1 py-0.5"
                      />
                      <input
                        value={r.description || ""}
                        onChange={(e) =>
                          updateRow(r.id, {
                            description: e.target.value || null,
                          })
                        }
                        placeholder="Detalle"
                        className="border rounded px-1 py-0.5"
                      />
                    </div>
                    {r.source === "NEW" && r.status === "REVIEW" && (
                      <div className="text-[11px] text-amber-700 mt-1">
                        Marcado para completar datos luego.
                      </div>
                    )}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <input
                      type="number"
                      min={1}
                      value={r.quantity}
                      onChange={(e) =>
                        updateRow(r.id, {
                          quantity: Math.max(
                            1,
                            parseInt(e.target.value || "1", 10),
                          ),
                        })
                      }
                      className="w-20 border rounded px-1 py-0.5"
                    />
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <input
                      value={r.unitCostInput}
                      onChange={(e) =>
                        updateRow(r.id, { unitCostInput: e.target.value })
                      }
                      className="w-24 border rounded px-1 py-0.5"
                      placeholder="Costo"
                    />
                  </td>
                  <td className="border px-2 py-1 text-center">
                    {toMoney(lineTotalCurrency)}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={r.marginClientPct}
                      onChange={(e) =>
                        updateRow(r.id, {
                          marginClientPct: Math.max(
                            0,
                            parseFloat(e.target.value || "0"),
                          ),
                        })
                      }
                      className="w-20 border rounded px-1 py-0.5"
                    />
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={r.marginAllyPct}
                      onChange={(e) =>
                        updateRow(r.id, {
                          marginAllyPct: Math.max(
                            0,
                            parseFloat(e.target.value || "0"),
                          ),
                        })
                      }
                      className="w-20 border rounded px-1 py-0.5"
                    />
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={r.marginWholesalePct}
                      onChange={(e) =>
                        updateRow(r.id, {
                          marginWholesalePct: Math.max(
                            0,
                            parseFloat(e.target.value || "0"),
                          ),
                        })
                      }
                      className="w-20 border rounded px-1 py-0.5"
                    />
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {toMoney(priceClientUSD)}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {toMoney(priceAllyUSD)}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {toMoney(priceWholesaleUSD)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  className="px-2 py-2 text-sm text-gray-500"
                  colSpan={11}
                >
                  No hay productos cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-gray-600">
          Seleccionados: {selectedRows.length} | Cantidad total: {totals.qty} |
          Costo USD: ${toMoney(totals.costUSD)}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            className="bg-green-600 text-white px-3 py-1 rounded"
          >
            Guardar entrada
          </button>
        </div>
      </div>

      <div className="border rounded p-3 bg-gray-50 space-y-3 text-sm">
        <div className="font-semibold">Totales de la factura</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-gray-600">
              Base imponible ({currency})
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full border rounded px-2 py-1"
                value={baseEdited ? baseAmountCurrency : baseFromItemsCurrency}
                onChange={(e) => {
                  setBaseEdited(true);
                  setBaseAmountCurrency(Number(e.target.value || 0));
                }}
              />
              <button
                type="button"
                className="border px-2 py-1 rounded"
                onClick={() => {
                  setBaseEdited(false);
                  setBaseAmountCurrency(
                    Number(baseFromItemsCurrency.toFixed(2)),
                  );
                }}
              >
                Recalcular
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Usa el total de items seleccionados. Se puede ajustar manualmente.
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600">
              Descuento ({currency})
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="w-full border rounded px-2 py-1"
              value={discountAmountCurrency}
              onChange={(e) =>
                setDiscountAmountCurrency(Number(e.target.value || 0))
              }
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">% IVA</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="w-full border rounded px-2 py-1"
              value={ivaPercent}
              onChange={(e) => {
                setIvaManual(false);
                setIvaPercent(Number(e.target.value || 0));
              }}
            />
            <div className="flex gap-2 mt-1">
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full border rounded px-2 py-1"
                value={ivaAmountCurrency}
                onChange={(e) => {
                  setIvaManual(true);
                  setIvaAmountCurrency(Number(e.target.value || 0));
                }}
              />
              {ivaManual && (
                <button
                  type="button"
                  className="border px-2 py-1 rounded"
                  onClick={() => setIvaManual(false)}
                >
                  Auto
                </button>
              )}
            </div>
            <div className="text-xs text-gray-500">
              IVA calculado sobre base - descuento. Se puede escribir manual.
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-600">Total factura ({currency})</div>
            <div className="text-lg font-semibold">
              {toMoney(totalInvoiceCurrency)}
            </div>
            {currency === "VES" && rate > 0 && (
              <div className="text-xs text-gray-500">
                Equiv. USD: ${toMoney(totalInvoiceUSD)}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-600">Base en USD</div>
            <div className="font-semibold">${toMoney(baseAmountUSD)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-600">Notas</div>
            <div className="text-gray-700 text-sm whitespace-pre-line">
              {notes || "Sin notas"}
            </div>
          </div>
        </div>
      </div>

      <div className="border rounded p-3 bg-gray-50 space-y-3 text-sm">
        <div className="font-semibold">Condiciones de pago</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-600 mb-1">Tipo de pago</div>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === "CONTADO"}
                  onChange={() => handlePaymentModeChange("CONTADO")}
                />
                <span>Pago inmediato (pago completo)</span>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === "CREDITO_SIN_ABONO"}
                  onChange={() => handlePaymentModeChange("CREDITO_SIN_ABONO")}
                />
                <span>Crédito (sin abono inicial)</span>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="paymentMode"
                  checked={paymentMode === "CREDITO_CON_ABONO"}
                  onChange={() => handlePaymentModeChange("CREDITO_CON_ABONO")}
                />
                <span>Crédito con abono inicial</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600">
              Monto abono USD (si aplica)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              disabled={paymentMode !== "CREDITO_CON_ABONO"}
              className="w-full border rounded px-2 py-1 disabled:opacity-60"
              value={paidAmountUSD === "" ? "" : paidAmountUSD}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  setPaidAmountUSD("");
                  return;
                }
                const n = Number(v);
                setPaidAmountUSD(isNaN(n) ? "" : n);
              }}
            />
            <div className="text-xs text-gray-500 mt-1">
              Se usa solo para registrar el abono inicial.
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600">
              Monto IGTF USD (solo si pago en USD)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              disabled={paymentCurrency !== "USD"}
              className="w-full border rounded px-2 py-1 disabled:opacity-60"
              value={paymentCurrency === "USD" ? igtfAmountManualUSD : 0}
              onChange={(e) =>
                setIgtfAmountManualUSD(Number(e.target.value || 0))
              }
            />
            <div className="text-xs text-gray-500 mt-1">
              Se suma al total financiero cuando el pago es en USD.
            </div>
          </div>
        </div>
        {invoiceImageUrl && (
          <div className="text-xs text-gray-700">
            Soporte de pago:{" "}
            <a
              href={invoiceImageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline break-all"
            >
              Ver recibo
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
