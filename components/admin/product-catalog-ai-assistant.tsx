"use client";

import { FormEvent, useState } from "react";

type Category = {
  id: string;
  slug: string;
  name: string;
};

type CreatedProduct = {
  id: string;
  name: string;
  slug: string;
};

type AssistantError = {
  name: string;
  reason: string;
};

type Props = {
  categories: Category[];
};

export default function ProductCatalogAiAssistant({ categories }: Props) {
  const [message, setMessage] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [created, setCreated] = useState<CreatedProduct[]>([]);
  const [errors, setErrors] = useState<AssistantError[]>([]);
  const [errorText, setErrorText] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorText("");
    setSummary("");
    setCreated([]);
    setErrors([]);

    if (!message.trim()) {
      setErrorText("Describe qué productos quieres agregar al catálogo.");
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, string> = { message };
      if (categorySlug) payload.categorySlug = categorySlug;
      const resp = await fetch("/api/assistant/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || "No se pudo generar el catálogo.");
      }
      setSummary(json.summary || "Productos generados con IA.");
      setCreated(Array.isArray(json.created) ? json.created : []);
      setErrors(Array.isArray(json.errors) ? json.errors : []);
      setMessage("");
    } catch (catched) {
      const reason = catched instanceof Error ? catched.message : "Error desconocido";
      setErrorText(reason);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2">
        <p className="text-lg font-semibold text-gray-900">Generador IA de catálogo</p>
        <p className="text-sm text-gray-500">
          Describe los nuevos productos que quieres publicar (nombre, categoría, marca, precio aproximado) y la IA los
          creará automáticamente.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Descripción para la IA</label>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ej. Tres salas nuevas con estilo moderno + cocina con acabados en madera clara..."
            rows={4}
            className="mt-1 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand focus:bg-white focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Categoría preferida (opcional)</label>
          <select
            value={categorySlug}
            onChange={(event) => setCategorySlug(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand focus:outline-none"
          >
            <option value="">Seleccionar categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        {errorText && <p className="text-sm text-red-600">{errorText}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className={inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition }
            disabled={loading}
          >
            {loading ? 'Generando…' : 'Crear productos con IA'}
          </button>
          <span className="text-xs font-medium text-gray-500">Máximo 8 productos por ejecución.</span>
        </div>
      </form>
      {summary && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {summary}
        </div>
      )}
      {created.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-800">Productos creados</p>
          <ul className="space-y-1 text-sm text-gray-700">
            {created.map((item) => (
              <li key={item.id}>
                <a
                  href={/dashboard/admin/productos/}
                  className="text-blue-600 underline"
                >
                  {item.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {errors.length > 0 && (
        <div className="space-y-1 text-sm text-gray-700">
          <p className="font-semibold text-gray-800">Errores</p>
          <ul className="list-disc pl-5 text-red-700">
            {errors.map((err) => (
              <li key={${err.name}-}>{err.name}: {err.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
