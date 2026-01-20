import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createDesignProjectAction, getArchitectUsers } from "@/server/actions/design-projects";
import { DesignProjectStage, DesignProjectStatus } from "@prisma/client";

export default async function NewDesignProjectPage() {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (!session?.user || role !== "ADMIN") {
    redirect("/auth/login?callbackUrl=/dashboard/admin/estudio/nuevo");
  }
  const architects = await getArchitectUsers();
  const statuses = Object.values(DesignProjectStatus);
  const stages = Object.values(DesignProjectStage);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo proyecto</h1>
          <p className="text-sm text-gray-600">Crea un proyecto del Estudio de Diseno.</p>
        </div>
        <Link className="text-sm text-gray-600 hover:underline" href="/dashboard/admin/estudio">
          Volver
        </Link>
      </div>

      <form action={createDesignProjectAction} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="text-sm font-semibold text-gray-700">Nombre del proyecto</label>
          <input name="name" required className="mt-1 w-full border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Cliente</label>
          <input name="clientName" required className="mt-1 w-full border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Ubicacion</label>
          <input name="location" required className="mt-1 w-full border rounded px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Arquitecto responsable</label>
            <select name="architectId" className="mt-1 w-full border rounded px-3 py-2 text-sm">
              <option value="">Sin asignar</option>
              {architects.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Prioridad (1-9)</label>
            <input
              name="priority"
              type="number"
              min={1}
              max={9}
              defaultValue={5}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Monto total del diseno (USD)</label>
          <input
            name="designTotalUSD"
            type="number"
            step="0.01"
            min={0}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Fecha inicio</label>
            <input name="startDate" type="date" className="mt-1 w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Fecha entrega</label>
            <input name="dueDate" type="date" className="mt-1 w-full border rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Estatus</label>
          <select name="status" className="mt-1 w-full border rounded px-3 py-2 text-sm">
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Etapa</label>
          <select name="stage" className="mt-1 w-full border rounded px-3 py-2 text-sm">
            {stages.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Descripcion</label>
          <textarea name="description" rows={4} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            Guardar
          </button>
          <Link href="/dashboard/admin/estudio" className="text-sm text-gray-600 hover:underline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
