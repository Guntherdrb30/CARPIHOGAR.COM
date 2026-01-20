"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MethodOption = { value: string; label: string };

const METHOD_LABELS: Record<string, string> = {
  PAGO_MOVIL: "Pago movil",
  TRANSFERENCIA: "Transferencia",
  ZELLE: "Zelle",
};

export default function ProjectPaymentsForm({
  projectId,
  methods,
}: {
  projectId: string;
  methods: string[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: MethodOption[] = useMemo(
    () =>
      methods.map((m) => ({
        value: m,
        label: METHOD_LABELS[m] || m.replace(/_/g, " "),
      })),
    [methods]
  );

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    const amountRaw = amount.replace(",", ".").trim();
    if (!amountRaw || !paidAt) {
      setError("Monto y fecha son obligatorios.");
      return;
    }
    setBusy(true);
    try {
      let fileUrl = "";
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("type", "file");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.url) {
          throw new Error(data?.error || "No se pudo subir el archivo");
        }
        fileUrl = String(data.url || "");
      }

      const resp = await fetch(`/api/design-projects/${projectId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUSD: amountRaw,
          paidAt,
          method: method || null,
          reference: reference || null,
          fileUrl: fileUrl || null,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo registrar el abono");
      }
      setAmount("");
      setReference("");
      setFile(null);
      setMethod("");
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message || "Error al registrar abono"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-4">
      <div className="text-sm font-semibold text-gray-800">Registrar abono</div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-600">Monto (USD)</label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            disabled={busy}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600">Fecha</label>
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            disabled={busy}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600">Metodo</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            disabled={busy}
          >
            <option value="">Selecciona</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600">Referencia</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            disabled={busy}
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="block text-xs text-gray-600">Archivo soporte (opcional)</label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mt-1 text-sm"
          disabled={busy}
        />
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="mt-3 px-3 py-2 rounded bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
      >
        {busy ? "Guardando..." : "Guardar abono"}
      </button>
    </div>
  );
}
