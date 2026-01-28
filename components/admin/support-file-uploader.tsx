\"use client\";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SupportFileUploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Selecciona un archivo PDF o Excel primero");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess("");
    try {
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("type", "document");
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: uploadData,
      });
      const uploadJson = await uploadRes.json().catch(() => ({} as any));
      if (!uploadRes.ok || !uploadJson?.url) {
        throw new Error(uploadJson?.error || "Error al subir el archivo");
      }

      const payload = {
        projectId,
        url: uploadJson.url,
        filename: file.name,
        fileType: "SOPORTE",
        description: description.trim() || null,
      };
      const res = await fetch("/api/admin/carpinteria/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "No se pudo registrar el soporte");
      }
      setSuccess("Soporte registrado correctamente.");
      setFile(null);
      setDescription("");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Error al registrar el soporte");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div className="space-y-1">
        <label className="block text-xs font-semibold text-gray-600">Archivo PDF / Excel</label>
        <input
          type="file"
          accept="application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          className="form-input"
        />
        <p className="text-xs text-gray-500">
          Adjunta documentos de soporte adicional (hojas de costos, especificaciones, etc.).
        </p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600">Descripción</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          className="form-input"
          placeholder="Describe qué contiene este archivo"
        />
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {success && <div className="text-xs text-emerald-600">{success}</div>}
      <button
        type="submit"
        disabled={busy}
        className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
      >
        {busy ? "Registrando..." : "Guardar soporte"}
      </button>
    </form>
  );
}
