"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const phases = [
  { value: "FABRICACION", label: "Fabricación" },
  { value: "CORTE_CANTEADO", label: "Corte y canteado" },
  { value: "ARMADO_ESTRUCTURA", label: "Armado de estructura" },
  { value: "ARMADO_PUERTAS", label: "Armado de puertas" },
  { value: "INSTALACION_HERRAJES", label: "Instalación de herrajes" },
  { value: "INSTALACION", label: "Instalación" },
  { value: "EMBALAJE", label: "Embalaje" },
  { value: "ALMACEN", label: "Almacén" },
];

type Employee = {
  id: string;
  name: string;
};

type Props = {
  projectId: string;
  employees: Employee[];
};

export default function CarpentryProgressForm({ projectId, employees }: Props) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [progressDate, setProgressDate] = useState(new Date().toISOString().slice(0, 10));
  const [phase, setPhase] = useState(phases[0].value);
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const uploadImage = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("type", file.type.startsWith("image/") ? "image" : "file");
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "No se pudo subir la imagen");
      }
      setImageUrl(String(data.url));
      setImageName(file.name);
    } catch (err: any) {
      setError(err?.message || "Error al subir la imagen");
    } finally {
      setUploading(false);
    }
  };

  const onImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!description.trim()) {
      setError("Describe el avance");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/carpinteria/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          description,
          progressDate,
          phase,
          responsibleEmployeeId: responsibleEmployeeId || null,
          imageUrl: imageUrl || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        throw new Error(data?.error || "No se pudo registrar el avance");
      }
      setDescription("");
      setImageUrl("");
      setImageName("");
      setResponsibleEmployeeId("");
      setSuccess("Avance registrado");
      router.refresh();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(String(err?.message || "Error al registrar avance"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded border border-dashed border-gray-300 bg-white p-4">
      <div className="text-sm font-semibold text-gray-800">Subir avance del proyecto</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="block text-xs uppercase tracking-[0.3em] text-gray-500">Fase</label>
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
          >
            {phases.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-[0.3em] text-gray-500">Fecha del avance</label>
          <input
            type="date"
            value={progressDate}
            onChange={(e) => setProgressDate(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs uppercase tracking-[0.3em] text-gray-500">Responsable</label>
          <select
            value={responsibleEmployeeId}
            onChange={(e) => setResponsibleEmployeeId(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
          >
            <option value="">Sin responsable</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-[0.3em] text-gray-500">Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-[0.3em] text-gray-500">Imagen (opcional)</label>
        <input
          type="file"
          accept="image/*"
          onChange={onImageChange}
          className="mt-1 text-sm"
          disabled={uploading || busy}
        />
        {imageName && <div className="mt-2 text-xs text-gray-600">Archivo cargado: {imageName}</div>}
        {imageUrl && (
          <div className="mt-2">
            <img src={imageUrl} alt="Avance" className="max-h-32 w-full rounded border" />
          </div>
        )}
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {success && <div className="text-xs text-green-600">{success}</div>}
      <button
        type="submit"
        disabled={busy || uploading}
        className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Guardando..." : "Registrar avance"}
      </button>
    </form>
  );
}
