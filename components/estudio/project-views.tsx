import Link from "next/link";

type Architect = { id: string; name: string | null; email: string | null };
type ProjectRow = {
  id: string;
  name: string;
  clientName: string;
  location: string;
  priority: number;
  status: string;
  startDate: Date | null;
  dueDate: Date | null;
  architect?: Architect | null;
};

const STATUS_COLUMNS = [
  { key: "NUEVO", label: "Nuevo" },
  { key: "EN_PROGRESO", label: "En progreso" },
  { key: "EN_REVISION", label: "En revision" },
  { key: "EN_PAUSA", label: "En pausa" },
  { key: "ENTREGADO", label: "Entregado" },
  { key: "CANCELADO", label: "Cancelado" },
];

const STATUS_STYLES: Record<string, string> = {
  NUEVO: "bg-blue-50 text-blue-700 border-blue-200",
  EN_PROGRESO: "bg-amber-50 text-amber-700 border-amber-200",
  EN_REVISION: "bg-purple-50 text-purple-700 border-purple-200",
  EN_PAUSA: "bg-gray-100 text-gray-700 border-gray-200",
  ENTREGADO: "bg-green-50 text-green-700 border-green-200",
  CANCELADO: "bg-red-50 text-red-700 border-red-200",
};

function formatDate(value: Date | null) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "-";
  }
}

function statusBadge(status: string) {
  const label = STATUS_COLUMNS.find((s) => s.key === status)?.label || status;
  const cls = STATUS_STYLES[status] || "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
      {label}
    </span>
  );
}

export function ProjectList({
  projects,
  showEdit,
  editBaseHref,
  actionLabel,
}: {
  projects: ProjectRow[];
  showEdit?: boolean;
  editBaseHref?: string;
  actionLabel?: string;
}) {
  const label = actionLabel || "Editar";
  return (
    <div className="bg-white rounded-lg shadow overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="text-left px-4 py-3">Proyecto</th>
            <th className="text-left px-4 py-3">Cliente</th>
            <th className="text-left px-4 py-3">Ubicacion</th>
            <th className="text-left px-4 py-3">Arquitecto</th>
            <th className="text-left px-4 py-3">Prioridad</th>
            <th className="text-left px-4 py-3">Fechas</th>
            <th className="text-left px-4 py-3">Estatus</th>
            {showEdit ? <th className="text-left px-4 py-3">Acciones</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y">
          {projects.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
              <td className="px-4 py-3 text-gray-600">{p.clientName}</td>
              <td className="px-4 py-3 text-gray-600">{p.location}</td>
              <td className="px-4 py-3 text-gray-600">
                {p.architect?.name || p.architect?.email || "Sin asignar"}
              </td>
              <td className="px-4 py-3 text-gray-600">{p.priority}</td>
              <td className="px-4 py-3 text-gray-600">
                <div>Inicio: {formatDate(p.startDate)}</div>
                <div>Entrega: {formatDate(p.dueDate)}</div>
              </td>
              <td className="px-4 py-3">{statusBadge(p.status)}</td>
              {showEdit ? (
                <td className="px-4 py-3">
                  {editBaseHref ? (
                    <Link className="text-blue-600 hover:underline" href={`${editBaseHref}/${p.id}`}>
                      {label}
                    </Link>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
          {projects.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-gray-500" colSpan={showEdit ? 8 : 7}>
                No hay proyectos disponibles.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ProjectBoard({ projects }: { projects: ProjectRow[] }) {
  const grouped = STATUS_COLUMNS.map((col) => ({
    ...col,
    items: projects.filter((p) => p.status === col.key),
  }));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {grouped.map((col) => (
        <div key={col.key} className="bg-white rounded-lg shadow p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-gray-800">{col.label}</div>
            <span className="text-xs text-gray-500">{col.items.length}</span>
          </div>
          <div className="space-y-2">
            {col.items.length === 0 && (
              <div className="text-xs text-gray-400">Sin proyectos</div>
            )}
            {col.items.map((p) => (
              <div key={p.id} className="border rounded-lg px-3 py-2 text-sm">
                <div className="font-semibold text-gray-900">{p.name}</div>
                <div className="text-xs text-gray-500">{p.clientName}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                  <span>Prioridad {p.priority}</span>
                  <span>Entrega: {formatDate(p.dueDate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
