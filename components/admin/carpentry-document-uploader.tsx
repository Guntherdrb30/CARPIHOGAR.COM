"use client";

import { useState } from "react";

type CarpentryProjectFileType = "PLANO" | "IMAGEN" | "CONTRATO" | "PRESUPUESTO" | "AVANCE" | "OTRO";

type FileEntry = {
  url: string;
  filename: string | null;
};

type Props = {
  fieldName: string;
  label: string;
  description: string;
  accept: string;
  fileType: CarpentryProjectFileType;
  max?: number;
};

type UploadingState = "idle" | "uploading";

export default function CarpentryDocumentUploader({
  fieldName,
  label,
  description,
  accept,
  fileType,
  max,
}: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [status, setStatus] = useState<UploadingState>("idle");
  const [error, setError] = useState<string | null>(null);

  const apiUpload = async (file: File) => {
    const type = file.type === "application/pdf" ? "document" : "image";
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok || !data?.url) {
      throw new Error(data?.error || "No se pudo subir el archivo");
    }
    return { url: data.url as string, filename: file.name };
  };

  const onFiles = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    setError(null);
    const list = Array.from(filesList);
    const slots = typeof max === "number" ? Math.max(0, max - files.length) : list.length;
    if (slots <= 0) {
      setError("Has alcanzado el límite de archivos.");
      return;
    }
    const toUpload = typeof max === "number" ? list.slice(0, slots) : list;
    try {
      setStatus("uploading");
      const uploaded: FileEntry[] = [];
      for (const file of toUpload) {
        const entry = await apiUpload(file);
        uploaded.push(entry);
      }
      setFiles((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      setError(err?.message || "Error al subir archivos");
    } finally {
      setStatus("idle");
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-gray-300 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.4em] text-gray-500">{label}</p>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700">
        <span>Seleccionar archivo{max === 1 ? "" : "s"}</span>
        <input
          type="file"
          accept={accept}
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="hidden"
          disabled={status === "uploading" || (typeof max === "number" && files.length >= max)}
        />
      </label>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {status === "uploading" && <div className="text-xs text-gray-500">Subiendo archivos...</div>}
      {files.length > 0 && (
        <ul className="space-y-1 text-xs text-gray-700">
          {files.map((file, index) => (
            <li key={`${file.url}-${index}`} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1">
              <span className="truncate">{file.filename || file.url}</span>
              <button
                type="button"
                className="text-[11px] font-semibold uppercase tracking-[0.3em] text-red-600"
                onClick={() => removeFile(index)}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.map((file, index) => (
        <input
          key={`hidden-${index}`}
          type="hidden"
          name={`${fieldName}[]`}
          value={JSON.stringify({ url: file.url, filename: file.filename, fileType })}
        />
      ))}
      {typeof max === "number" && (
        <div className="text-[11px] text-gray-500">
          {files.length}/{max} archivos cargados
        </div>
      )}
    </div>
  );
}
