"use client";

import { useState } from "react";

type UploadedFile = {
  url: string;
  filename: string;
  fileType: "PLANO" | "IMAGEN" | "OTRO";
};

type Props = {
  projectId: string;
  fileType: "PLANO" | "IMAGEN" | "CONTRATO" | "PRESUPUESTO" | "AVANCE" | "OTRO";
  label?: string;
  max?: number;
  existingCount?: number;
};

export default function CarpentryFileUploader({
  projectId,
  fileType,
  label,
  max,
  existingCount = 0,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);

  const allowed = (() => {
    if (fileType === "PLANO" || fileType === "CONTRATO" || fileType === "PRESUPUESTO") {
      return "application/pdf";
    }
    if (fileType === "IMAGEN" || fileType === "AVANCE") {
      return "image/*";
    }
    return "image/*,application/pdf";
  })();

  const uploadFile = async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    const type = isPdf ? "document" : "image";
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      throw new Error(data?.error || "Upload fallido");
    }
    return { url: data.url as string, filename: file.name, fileType };
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const list = Array.from(files);
      const currentCount = existingCount + uploads.length;
      const remaining = typeof max === "number" ? Math.max(0, max - currentCount) : list.length;
      if (typeof max === "number" && remaining <= 0) {
        setError("Limite de archivos alcanzado.");
        return;
      }
      const limited = typeof max === "number" ? list.slice(0, remaining) : list;
      const next: UploadedFile[] = [];
      for (const file of limited) {
        const up = await uploadFile(file);
        const save = await fetch("/api/admin/carpinteria/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, ...up, fileType }),
        });
        if (!save.ok) {
          const msg = await save.json().catch(() => ({} as any));
          throw new Error(msg?.error || "No se pudo guardar el archivo");
        }
        next.push(up);
      }
      setUploads((prev) => [...prev, ...next]);
    } catch (err: any) {
      setError(err?.message || "Error al subir archivos");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && <div className="text-xs font-semibold text-gray-600">{label}</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}
      <input
        type="file"
        accept={allowed}
        multiple
        onChange={(e) => onFiles(e.target.files)}
        disabled={busy || (typeof max === "number" && existingCount + uploads.length >= max)}
      />
      {busy && <div className="text-xs text-gray-500">Subiendo...</div>}
      {uploads.length > 0 && (
        <div className="text-xs text-gray-600">
          {uploads.length} archivo(s) subidos.
        </div>
      )}
    </div>
  );
}
