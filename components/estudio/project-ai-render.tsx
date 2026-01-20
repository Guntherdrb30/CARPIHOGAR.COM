"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RenderRow = {
  id: string;
  prompt: string;
  outputImageUrl: string;
  createdAt: Date | string;
  createdBy?: { name: string | null; email: string | null } | null;
};

export default function ProjectAiRender({
  projectId,
  renders,
}: {
  projectId: string;
  renders: RenderRow[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [variants, setVariants] = useState("2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variantOptions = useMemo(() => ["1", "2", "3", "4"], []);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!file) {
      setError("Sube una imagen renderizada.");
      return;
    }
    if (!prompt.trim()) {
      setError("Escribe el prompt de la variacion.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("prompt", prompt.trim());
      fd.append("variants", variants);
      const res = await fetch(`/api/design-projects/${projectId}/renders`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo generar la imagen");
      }
      setFile(null);
      setPrompt("");
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message || "Error generando render"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Renders con IA</h2>
        <p className="text-sm text-gray-600">
          Sube un render base y describe el nuevo angulo o estilo. Todas las salidas llevan marca de agua Trends172.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-700">Render base</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="mt-1 text-sm"
            disabled={busy}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Variantes</label>
          <select
            value={variants}
            onChange={(e) => setVariants(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
            disabled={busy}
          >
            {variantOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-700">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Ej: Generar un angulo lateral con luz calida, estilo interiorismo de lujo, materiales nobles."
          className="mt-1 w-full border rounded px-3 py-2 text-sm"
          disabled={busy}
        />
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="px-3 py-2 rounded bg-red-600 text-white text-sm font-semibold disabled:opacity-60"
      >
        {busy ? "Generando..." : "Generar renders"}
      </button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {renders.map((r) => (
          <div key={r.id} className="border rounded-lg overflow-hidden bg-gray-50">
            <img src={r.outputImageUrl} alt="render IA" className="w-full h-48 object-cover" />
            <div className="p-2 space-y-1 text-xs text-gray-600">
              <div className="font-semibold text-gray-800 line-clamp-2">{r.prompt}</div>
              <div>
                {r.createdBy?.name || r.createdBy?.email || "Usuario"} •{" "}
                {new Date(r.createdAt).toLocaleDateString("es-VE")}
              </div>
              <a className="text-blue-600 underline" href={r.outputImageUrl} target="_blank" rel="noreferrer">
                Descargar
              </a>
            </div>
          </div>
        ))}
        {renders.length === 0 && (
          <div className="text-sm text-gray-500">Aun no hay renders generados.</div>
        )}
      </div>
    </div>
  );
}
