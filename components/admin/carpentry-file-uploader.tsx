"use client";

import { useState } from "react";

type UploadedFile = {
  url: string;
  filename: string;
  fileType: "PLANO" | "IMAGEN" | "OTRO";
};

export default function CarpentryFileUploader({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);

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
    const fileType: UploadedFile["fileType"] = isPdf ? "PLANO" : isImage ? "IMAGEN" : "OTRO";
    return { url: data.url as string, filename: file.name, fileType };
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const list = Array.from(files);
      const next: UploadedFile[] = [];
      for (const file of list) {
        const up = await uploadFile(file);
        const save = await fetch("/api/admin/carpinteria/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, ...up }),
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
      {error && <div className="text-xs text-red-600">{error}</div>}
      <input
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={(e) => onFiles(e.target.files)}
        disabled={busy}
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
