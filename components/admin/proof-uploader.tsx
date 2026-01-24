"use client";

import { useState } from "react";

export default function ProofUploader({ inputName }: { inputName: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("type", file.type === "application/pdf" ? "document" : "image");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Upload fallido");
      }
      setUrl(data.url as string);
    } catch (err: any) {
      setError(err?.message || "Error al subir comprobante");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      {error && <div className="text-xs text-red-600">{error}</div>}
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
        disabled={busy}
      />
      {busy && <div className="text-xs text-gray-500">Subiendo...</div>}
      {url && (
        <div className="text-xs text-green-700">
          Comprobante cargado.
          <input type="hidden" name={inputName} value={url} />
        </div>
      )}
    </div>
  );
}
