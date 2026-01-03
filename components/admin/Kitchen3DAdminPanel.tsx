"use client";

import { useMemo, useState } from "react";

type KitchenModuleItem = {
  id: string;
  name: string;
  description?: string | null;
  images?: string[] | null;
  kitchenCategory?: string | null;
  sku?: string | null;
  code?: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  TOWER: "Torres",
  PANTRY: "Alacenas",
  OTHER: "Alacenas",
  FRIDGE: "Neveras",
  LOW: "Muebles bajos",
  HIGH: "Muebles altos",
  CONDIMENT: "Condimenteros",
};

const CATEGORY_ORDER = [
  "Torres",
  "Alacenas",
  "Neveras",
  "Muebles bajos",
  "Muebles altos",
  "Condimenteros",
];

const FALLBACK_MODULE_IMAGE = "/images/hero-carpinteria-1.svg";

const resolveCategoryLabel = (item: KitchenModuleItem) =>
  CATEGORY_LABELS[String(item.kitchenCategory || "OTHER")] || "Sin categoria";

const resolveProductImage = (item: KitchenModuleItem) => {
  const images = Array.isArray(item.images) ? item.images : [];
  return images[0] || FALLBACK_MODULE_IMAGE;
};

export default function Kitchen3DAdminPanel({ modules }: { modules: KitchenModuleItem[] }) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string | null>>({});

  const grouped = useMemo(() => {
    const out: Record<string, KitchenModuleItem[]> = {};
    for (const item of modules) {
      const label = resolveCategoryLabel(item);
      if (!out[label]) out[label] = [];
      out[label].push(item);
    }
    return out;
  }, [modules]);

  const handleUpload = async (item: KitchenModuleItem, file: File | null) => {
    if (!file) return;
    setUploadingId(item.id);
    setMessages((prev) => ({ ...prev, [item.id]: null }));
    try {
      const formData = new FormData();
      formData.append("productId", item.id);
      formData.append("file", file);
      const res = await fetch("/api/3d/upload-skp", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo subir.");
      }
      setMessages((prev) => ({
        ...prev,
        [item.id]: "Archivo recibido. Conversion en cola.",
      }));
    } catch (error: any) {
      setMessages((prev) => ({
        ...prev,
        [item.id]: error?.message || "No se pudo subir.",
      }));
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <section className="bg-white p-4 rounded-lg shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Muebles 3D</h2>
          <p className="text-sm text-gray-600">
            Sube archivos SKP y edita los muebles de cocina.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500">{modules.length} items</div>
          <a
            href="/dashboard/admin/productos?createKitchen=1"
            className="inline-flex items-center rounded border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Crear mueble de cocina
          </a>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="space-y-4">
          {modules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">
                No hay muebles 3D cargados.
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Crea un producto tipo KITCHEN_MODULE y marca "Visible en Kitchen Designer".
              </div>
              <div className="mt-3">
                <a
                  href="/dashboard/admin/productos?createKitchen=1"
                  className="inline-flex items-center rounded bg-gray-900 px-3 py-2 text-xs font-semibold text-white"
                >
                  Ir a crear mueble
                </a>
              </div>
            </div>
          ) : (
            CATEGORY_ORDER.map((section) => {
              const items = grouped[section] || [];
              if (!items.length) return null;
              return (
                <div key={section} className="space-y-2">
                  <div className="text-sm font-semibold text-gray-900">{section}</div>
                  <div className="space-y-3">
                    {items.map((item) => {
                      const isUploading = uploadingId === item.id;
                      const message = messages[item.id];
                      return (
                        <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-start gap-3">
                            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                              <img
                                src={resolveProductImage(item)}
                                alt={item.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">
                                    {item.name}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {item.sku || item.code || "Sin SKU"}
                                  </div>
                                </div>
                                <a
                                  href={`/dashboard/admin/productos/${item.id}`}
                                  className="text-xs font-semibold text-blue-600 underline"
                                >
                                  Editar
                                </a>
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {item.description || "Modulo de cocina."}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <label
                                  className={`inline-flex items-center rounded border px-3 py-1 text-xs font-semibold ${
                                    isUploading
                                      ? "border-gray-200 text-gray-400"
                                      : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                  }`}
                                >
                                  {isUploading ? "Subiendo..." : "Subir SKP"}
                                  <input
                                    type="file"
                                    accept=".skp"
                                    className="hidden"
                                    disabled={isUploading}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0] || null;
                                      handleUpload(item, file);
                                      event.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                                {message && (
                                  <span className="text-xs text-gray-500">{message}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <div className="font-semibold text-gray-900">Notas</div>
          <ul className="mt-2 space-y-2 text-xs text-gray-500">
            <li>Sube archivos .skp por mueble.</li>
            <li>La conversion a GLB se procesa en segundo plano.</li>
            <li>Selecciona KITCHEN_MODULE y activa Visible en Kitchen Designer.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
