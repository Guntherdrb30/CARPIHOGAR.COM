
"use client";

import { useEffect, useMemo, useState } from "react";
import PurchasePreviewTable, { type PaymentMode } from "./purchase-preview-table";

type Supplier = {
  id: string;
  name: string;
};

type BankAccount = {
  id: string;
  name: string;
  bankName?: string | null;
  accountNumber?: string | null;
  currency: "USD" | "VES" | "USDT";
};

type Margins = {
  client: number;
  ally: number;
  wholesale: number;
};

export default function PurchaseEntryForm({
  suppliers,
  defaultTasa,
  defaultIvaPercent,
  bankAccounts,
  defaultMargins,
}: {
  suppliers: Supplier[];
  defaultTasa: number;
  defaultIvaPercent: number;
  bankAccounts: BankAccount[];
  defaultMargins: Margins;
}) {
  const [supplierId, setSupplierId] = useState<string>("");
  const [currency, setCurrency] = useState<"USD" | "VES">("USD");
  const [tasaVES, setTasaVES] = useState<number>(defaultTasa || 0);
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [paymentCurrency, setPaymentCurrency] = useState<"USD" | "VES">(
    "USD",
  );
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CONTADO");
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [paymentUploading, setPaymentUploading] = useState(false);
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState<string>("");

  useEffect(() => {
    setPaymentCurrency(currency);
  }, [currency]);

  const normalizedMargins = useMemo<Margins>(
    () => ({
      client: Number(defaultMargins?.client || 40),
      ally: Number(defaultMargins?.ally || 30),
      wholesale: Number(defaultMargins?.wholesale || 20),
    }),
    [defaultMargins],
  );

  const handlePaymentUpload = async () => {
    if (!paymentFile) return;
    setPaymentUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", paymentFile);
      const isImage =
        typeof paymentFile.type === "string" &&
        paymentFile.type.toLowerCase().startsWith("image/");
      fd.append("type", isImage ? "image" : "file");
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.error || "Error subiendo soporte");
      setPaymentReceiptUrl(String(data.url));
    } catch (e: any) {
      alert(e?.message || "No se pudo subir el soporte de pago");
    } finally {
      setPaymentUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Registra la entrada de productos tal como vienen en la factura del proveedor.
          Primero completa los datos de la factura y luego agrega cada ítem con su precio unitario y cantidad.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="form-label">Proveedor</label>
            <select
              className="form-select"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Seleccione</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Número de factura</label>
            <input
              className="form-input"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Ej: F1234"
            />
          </div>
          <div>
            <label className="form-label">Fecha de factura</label>
            <input
              className="form-input"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="form-label">Moneda de la factura</label>
            <select
              className="form-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
            >
              <option value="USD">USD</option>
              <option value="VES">Bolívares</option>
            </select>
          </div>
          {currency === "VES" && (
            <div>
              <label className="form-label">Tasa VES/USD</label>
              <input
                className="form-input"
                type="number"
                step={0.0001}
                value={tasaVES}
                onChange={(e) => setTasaVES(Number(e.target.value || 0))}
              />
              <p className="text-xs text-gray-500 mt-1">
                Usa la tasa aplicada en la factura o el día del pago.
              </p>
            </div>
          )}
          <div>
            <label className="form-label">Moneda del pago</label>
            <select
              className="form-select"
              value={paymentCurrency}
              onChange={(e) => setPaymentCurrency(e.target.value as any)}
            >
              <option value="USD">USD</option>
              <option value="VES">Bolívares</option>
            </select>
          </div>
          <div>
            <label className="form-label">Cuenta bancaria</label>
            <select
              className="form-select"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              <option value="">Sin vínculo</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.bankName ? `- ${b.bankName}` : ""} ({b.currency})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="form-label">Tipo de pago</label>
            <select
              className="form-select"
              value={paymentMode}
              onChange={(e) =>
                setPaymentMode(
                  e.target.value as
                    | "CONTADO"
                    | "CREDITO_SIN_ABONO"
                    | "CREDITO_CON_ABONO",
                )
              }
            >
              <option value="CONTADO">Contado (pago completo)</option>
              <option value="CREDITO_CON_ABONO">
                Pago parcial (crédito con abono inicial)
              </option>
              <option value="CREDITO_SIN_ABONO">
                Crédito (sin abono inicial)
              </option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Referencia de pago (opcional)</label>
            <input
              className="form-input"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Transferencia / pago móvil"
            />
          </div>
          <div>
            <label className="form-label">Notas internas</label>
            <textarea
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              placeholder="Observaciones de la entrada"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="form-label">Soporte de pago (imagen/PDF)</label>
          <input
            className="form-input"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setPaymentFile(e.target.files?.[0] || null)}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!paymentFile || paymentUploading}
              onClick={handlePaymentUpload}
              className="bg-emerald-600 text-white px-3 py-1 rounded disabled:opacity-50"
            >
              {paymentUploading ? "Subiendo..." : "Subir soporte"}
            </button>
            {paymentReceiptUrl && (
              <a
                href={paymentReceiptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 underline break-all"
              >
                Ver soporte de pago
              </a>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Se guardar? junto a la entrada. Si hay varios abonos, los adicionales se registran en Cuentas por pagar.
          </p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <PurchasePreviewTable
          supplierId={supplierId || undefined}
          currency={currency}
          tasaVES={tasaVES}
          invoiceNumber={invoiceNumber || undefined}
          invoiceDate={invoiceDate || undefined}
          invoiceImageUrl={paymentReceiptUrl || undefined}
          defaultIvaPercent={defaultIvaPercent}
          paymentCurrency={paymentCurrency}
          bankAccountId={bankAccountId || undefined}
          paymentReference={paymentReference || undefined}
          notes={notes || undefined}
          paymentMode={paymentMode}
          defaultMargins={normalizedMargins}
        />
      </div>
    </div>
  );
}
