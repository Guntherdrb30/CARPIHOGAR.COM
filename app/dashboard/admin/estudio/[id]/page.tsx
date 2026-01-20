import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getArchitectUsers, updateDesignProjectAction } from "@/server/actions/design-projects";
import { DesignProjectStatus } from "@prisma/client";

export default async function EditDesignProjectPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; message?: string };
}) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (!session?.user || role !== "ADMIN") {
    redirect(`/auth/login?callbackUrl=/dashboard/admin/estudio/${params.id}`);
  }
  const project = await prisma.designProject.findUnique({
    where: { id: params.id },
  });
  if (!project) {
    redirect("/dashboard/admin/estudio?error=Proyecto%20no%20encontrado");
  }
  const architects = await getArchitectUsers();
  const statuses = Object.values(DesignProjectStatus);

  const formatDate = (value: Date | null) => {
    if (!value) return "";
    const d = new Date(value);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editar proyecto</h1>
          <p className="text-sm text-gray-600">Actualiza datos y asignaciones.</p>
        </div>
        <Link className="text-sm text-gray-600 hover:underline" href="/dashboard/admin/estudio">
          Volver
        </Link>
      </div>

      {searchParams?.error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </div>
      )}
      {searchParams?.message && (
        <div className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {searchParams.message}
        </div>
      )}

      <form action={updateDesignProjectAction} className="bg-white rounded-lg shadow p-6 space-y-4">
        <input type="hidden" name="id" value={project.id} />
        <div>
          <label className="text-sm font-semibold text-gray-700">Nombre del proyecto</label>
          <input
            name="name"
            defaultValue={project.name}
            required
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Cliente</label>
          <input
            name="clientName"
            defaultValue={project.clientName}
            required
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Ubicacion</label>
          <input
            name="location"
            defaultValue={project.location}
            required
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Arquitecto responsable</label>
            <select name="architectId" defaultValue={project.architectId || ""} className="mt-1 w-full border rounded px-3 py-2 text-sm">
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
              defaultValue={project.priority}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Fecha inicio</label>
            <input
              name="startDate"
              type="date"
              defaultValue={formatDate(project.startDate)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Fecha entrega</label>
            <input
              name="dueDate"
              type="date"
              defaultValue={formatDate(project.dueDate)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Estatus</label>
          <select name="status" defaultValue={project.status} className="mt-1 w-full border rounded px-3 py-2 text-sm">
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">Descripcion</label>
          <textarea
            name="description"
            rows={4}
            defaultValue={project.description || ""}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            Guardar cambios
          </button>
          <Link href="/dashboard/admin/estudio" className="text-sm text-gray-600 hover:underline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
