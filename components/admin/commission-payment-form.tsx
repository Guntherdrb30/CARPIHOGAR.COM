"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Seller = { id: string; name?: string | null; email: string };

type MethodOption = {
  value: "EFECTIVO" | "PAGO_MOVIL" | "TRANSFERENCIA";
  label: string;
  currency: "USD" | "VES";
};

const METHOD_OPTIONS: MethodOption[] = [
  { value: "EFECTIVO", label: "Efectivo (USD)", currency: "USD" },
  { value: "PAGO_MOVIL", label: "Pago movil (VES)", currency: "VES" },
  { value: "TRANSFERENCIA", label: "Transferencia (VES)", currency: "VES" },
];

export default function CommissionPaymentForm({
  sellers,
  defaultSellerId,
}: {
  sellers: Seller[];
  defaultSellerId?: string;
}) {
  const router = useRouter();
  const [sellerId, setSellerId] = useState(defaultSellerId || "");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [method, setMethod] = useState<MethodOption["value"]>("EFECTIVO");
  const [reference, setReference] = useState("");
  const [bankName, setBankName] = useState("");
  const [paidByName, setPaidByName] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const currency = useMemo(() => {
    return METHOD_OPTIONS.find((m) => m.value === method)?.currency || "USD";
  }, [method]);

  const resetForm = () => {
    setAmount("");
    setPaidAt("");
    setReference("");
    setBankName("");
    setPaidByName("");
    setProof(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!sellerId) {
      setError("Selecciona un vendedor.");
      return;
    }
    const amountRaw = amount.replace(",", ".").trim();
    const parsed = Number(amountRaw);
    if (!amountRaw || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Monto invalido.");
      return;
    }
    if (!paidAt) {
      setError("Fecha de pago requerida.");
      return;
    }
    if (method !== "EFECTIVO") {
      if (!reference.trim()) {
        setError("Referencia requerida.");
        return;
      }
      if (!bankName.trim()) {
        setError("Banco requerido.");
        return;
      }
    }

    setSubmitting(true);
    try {
      let proofUrl = "";
      if (proof) {
        const fd = new FormData();
        fd.append("file", proof);
        fd.append("type", "image");
        const upload = await fetch("/api/upload", { method: "POST", body: fd });
        const upData = await upload.json().catch(() => ({}));
        if (!upload.ok || !upData?.url) {
          throw new Error(upData?.error || "No se pudo subir el soporte");
        }
        proofUrl = String(upData.url || "");
      }

      const res = await fetch("/api/admin/commission-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId,
          amount: amountRaw,
          paidAt,
          method,
          reference,
          bankName,
          paidByName,
          proofUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo registrar el pago");
      }
      setMessage("Pago registrado.");
      resetForm();
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message || "Error al registrar pago"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-600 mb-1">Vendedor</label>
          <select
            className="border rounded px-2 py-1 w-full"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
          >
            <option value="">Selecciona vendedor</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Fecha de pago</label>
          <input
            type="date"
            className="border rounded px-2 py-1 w-full"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Monto pagado</label>
          <input
            type="number"
            step="0.01"
            min={0}
            className="border rounded px-2 py-1 w-full"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={currency === "USD" ? "USD" : "VES"}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Tipo de pago</label>
          <select
            className="border rounded px-2 py-1 w-full"
            value={method}
            onChange={(e) => setMethod(e.target.value as MethodOption["value"])}
          >
            {METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Banco</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder={method === "EFECTIVO" ? "No aplica" : "Banco origen"}
            disabled={method === "EFECTIVO"}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Referencia</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={method === "EFECTIVO" ? "No aplica" : "Numero de referencia"}
            disabled={method === "EFECTIVO"}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Responsable del pago</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={paidByName}
            onChange={(e) => setPaidByName(e.target.value)}
            placeholder="Nombre del responsable"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-600 mb-1">Soporte (imagen)</label>
          <input
            className="border rounded px-2 py-1 w-full"
            type="file"
            accept="image/*"
            onChange={(e) => setProof(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}
      {message && <div className="text-xs text-green-700">{message}</div>}

      <button
        type="submit"
        className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-50"
        disabled={submitting}
      >
        {submitting ? "Guardando..." : "Registrar pago"}
      </button>
    </form>
  );
}
