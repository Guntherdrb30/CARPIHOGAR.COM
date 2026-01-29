import Link from "next/link";
import { getCarpentryProjects } from "@/server/actions/carpentry";
import { getDesignProjectsForSession } from "@/server/actions/design-projects";

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

export default async function SupervisorDashboardPage() {
  const [carpProjects, designProjects] = await Promise.all([
    getCarpentryProjects(),
    getDesignProjectsForSession(),
  ]);

  const totalCarpProjects = carpProjects.length;
  const inProgressCarp = carpProjects.filter((p) => p.status !== "CERRADO").length;
  const totalCarpAmount = carpProjects.reduce((acc, p) => acc + Number(p.totalAmountUSD || 0), 0);
  const totalDesignProjects = designProjects.length;
  const activeDesign = designProjects.filter((p) => p.status !== "ENTREGADO" && p.status !== "CANCELADO").length;
  const deliveredDesign = designProjects.filter((p) => p.status === "ENTREGADO").length;

  const latestCarp = carpProjects.slice(0, 3);
  const latestDesign = designProjects.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Panel de Supervisor de Proyectos</h1>
          <p className="text-sm text-gray-600">Controla el avance de los proyectos de carpintería y diseño interior desde un solo lugar.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/supervisor/carpinteria"
            className="rounded-full border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-600 transition hover:bg-amber-100"
          >
            Carpintería
          </Link>
          <Link
            href="/dashboard/supervisor/estudio"
            className="rounded-full border border-emerald-500 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-100"
          >
            Estudio
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Carpintería</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{totalCarpProjects}</p>
          <p className="text-sm text-gray-500">Proyectos totales</p>
          <p className="mt-2 text-sm text-gray-500">{inProgressCarp} activos · {formatCurrency(totalCarpAmount)} USD</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Diseño</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{totalDesignProjects}</p>
          <p className="text-sm text-gray-500">Proyectos totales</p>
          <p className="mt-2 text-sm text-gray-500">{activeDesign} activos · {deliveredDesign} entregados</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Foco</p>
          <p className="mt-2 text-lg font-semibold text-gray-900">{latestCarp.length + latestDesign.length} proyectos recientes</p>
          <p className="text-sm text-gray-500">Revisa los proyectos más recientes y actúa rápido.</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Carpintería reciente</h2>
            <span className="text-xs uppercase tracking-[0.3em] text-gray-500">{carpProjects.length} en total</span>
          </div>
          <div className="mt-4 space-y-3">
            {latestCarp.length === 0 ? (
              <p className="text-sm text-gray-500">No hay proyectos aún.</p>
            ) : (
              latestCarp.map((project) => (
                <div key={project.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900">{project.name}</p>
                    <span className="text-xs text-gray-500">{project.status}</span>
                  </div>
                  <p className="text-sm text-gray-600">{project.clientName || "Cliente sin asignar"}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(Number(project.totalAmountUSD || 0))}</p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Diseño reciente</h2>
            <span className="text-xs uppercase tracking-[0.3em] text-gray-500">{designProjects.length} en total</span>
          </div>
          <div className="mt-4 space-y-3">
            {latestDesign.length === 0 ? (
              <p className="text-sm text-gray-500">Sin proyectos aún.</p>
            ) : (
              latestDesign.map((project) => (
                <div key={project.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900">{project.name}</p>
                    <span className="text-xs text-gray-500">{project.status}</span>
                  </div>
                  <p className="text-sm text-gray-600">{project.clientName}</p>
                  <p className="text-xs text-gray-500">{new Date(project.dueDate || project.startDate || new Date()).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
