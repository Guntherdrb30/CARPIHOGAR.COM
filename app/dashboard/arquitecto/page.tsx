import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDesignProjectsForSession } from "@/server/actions/design-projects";

type DueItem = {
  id: string;
  title: string;
  dueAt: Date | null;
};

function daysUntil(date: Date | null) {
  if (!date) return Number.POSITIVE_INFINITY;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function ArchitectDashboardPage() {
  const session = await getServerSession(authOptions);
  const name = String(session?.user?.name || "Arquitecto").split(" ")[0];

  const projects = await getDesignProjectsForSession();
  const activeProjects = projects.filter(
    (p) => p.status !== "ENTREGADO" && p.status !== "CANCELADO"
  );
  const tasks: DueItem[] = activeProjects
    .map((p) => ({
      id: p.id,
      title: p.name,
      dueAt: p.dueDate || p.startDate || null,
    }))
    .slice(0, 6);
  const deliveries: DueItem[] = projects
    .filter((p) => p.dueDate)
    .map((p) => ({
      id: p.id,
      title: p.name,
      dueAt: p.dueDate as Date,
    }))
    .sort((a, b) => {
      const aTime = a.dueAt ? a.dueAt.getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.dueAt ? b.dueAt.getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    })
    .slice(0, 6);

  const alertYellow = [...tasks, ...deliveries].filter((item) => {
    const d = daysUntil(item.dueAt);
    return d >= 1 && d <= 3;
  });
  const alertRed = [...tasks, ...deliveries].filter((item) => daysUntil(item.dueAt) <= 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800">Hola, {name}</h1>
      <p className="mt-1 text-gray-600">
        Este es tu resumen operativo. Aqui veras tus proyectos y entregas.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Proyectos asignados</div>
          <div className="text-3xl font-semibold text-gray-900">{projects.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Tareas pendientes</div>
          <div className="text-3xl font-semibold text-gray-900">{tasks.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Entregas proximas</div>
          <div className="text-3xl font-semibold text-gray-900">{deliveries.length}</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Proyectos asignados</h2>
            <span className="text-sm text-gray-500">{projects.length} en total</span>
          </div>
          {projects.length === 0 ? (
            <div className="text-sm text-gray-500">No tienes proyectos asignados.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {projects.map((p) => (
                <li key={p.id} className="border rounded px-3 py-2 flex items-center justify-between">
                  <span className="font-medium text-gray-900">{p.name}</span>
                  <span className="text-xs text-gray-500">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-800">Alertas por tiempo</h2>
          <div className="mt-3 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="text-amber-700 font-medium">Amarillo (1-3 dias)</span>
              <span className="text-amber-700 font-semibold">{alertYellow.length}</span>
            </div>
            <div className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2">
              <span className="text-red-700 font-medium">Rojo (vencido)</span>
              <span className="text-red-700 font-semibold">{alertRed.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Tareas pendientes</h2>
            <span className="text-sm text-gray-500">{tasks.length}</span>
          </div>
          {tasks.length === 0 ? (
            <div className="text-sm text-gray-500">No tienes tareas pendientes.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {tasks.map((t) => (
                <li key={t.id} className="border rounded px-3 py-2 flex items-center justify-between">
                  <span className="font-medium text-gray-900">{t.title}</span>
                  <span className="text-xs text-gray-500">
                    {t.dueAt ? t.dueAt.toLocaleDateString() : "-"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Entregas proximas</h2>
            <span className="text-sm text-gray-500">{deliveries.length}</span>
          </div>
          {deliveries.length === 0 ? (
            <div className="text-sm text-gray-500">No tienes entregas proximas.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {deliveries.map((d) => (
                <li key={d.id} className="border rounded px-3 py-2 flex items-center justify-between">
                  <span className="font-medium text-gray-900">{d.title}</span>
                  <span className="text-xs text-gray-500">
                    {d.dueAt ? d.dueAt.toLocaleDateString() : "-"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
