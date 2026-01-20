"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProjectUpdateForm({
  projectId,
  canPost,
}: {
  projectId: string;
  canPost: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!canPost || busy) return;
    setError(null);
    if (!note.trim() && !file) {
      setError("Agrega un comentario o un archivo.");
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

      const resp = await fetch(`/api/design-projects/${projectId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, fileUrl }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo guardar el avance");
      }
      setNote("");
      setFile(null);
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message || "Error al guardar el avance"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-4">
      <div className="text-sm font-semibold text-gray-800">Subir avance</div>
      <div className="mt-3 space-y-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Describe el avance..."
          className="w-full rounded border px-3 py-2 text-sm"
          disabled={!canPost || busy}
        />
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-sm"
          disabled={!canPost || busy}
        />
        {error && <div className="text-xs text-red-600">{error}</div>}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canPost || busy}
          className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Subiendo..." : "Guardar avance"}
        </button>
      </div>
    </div>
  );
}
