import { DesignTaskStatus } from "@prisma/client";
import { createDesignProjectTaskAction, updateDesignProjectTaskAction } from "@/server/actions/design-project-tasks";

type Architect = { id: string; name: string | null; email: string | null };
type TaskRow = {
  id: string;
  title: string;
  assignedToId: string | null;
  assignedTo?: Architect | null;
  dueDate: Date | null;
  priority: number;
  status: DesignTaskStatus | string;
  comments: string | null;
};

const STATUS_VALUES = Object.values(DesignTaskStatus);

function formatDate(value: Date | null) {
  if (!value) return "";
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ProjectTasksSection({
  projectId,
  tasks,
  architects,
  role,
  userId,
}: {
  projectId: string;
  tasks: TaskRow[];
  architects: Architect[];
  role: "ADMIN" | "ARCHITECTO";
  userId: string;
}) {
  const canAdmin = role === "ADMIN";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Tareas del proyecto</h2>
        <span className="text-sm text-gray-500">{tasks.length} tareas</span>
      </div>

      {canAdmin && (
        <form action={createDesignProjectTaskAction} className="bg-white rounded-lg shadow p-4 space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Titulo</label>
              <input name="title" required className="mt-1 w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Responsable</label>
              <select name="assignedToId" className="mt-1 w-full border rounded px-3 py-2 text-sm">
                <option value="">Sin asignar</option>
                {architects.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Fecha limite</label>
              <input name="dueDate" type="date" className="mt-1 w-full border rounded px-3 py-2 text-sm" />
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
            <div>
              <label className="text-sm font-semibold text-gray-700">Estatus</label>
              <select name="status" className="mt-1 w-full border rounded px-3 py-2 text-sm">
                {STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {String(s).replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-semibold">
                Crear tarea
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Comentarios</label>
            <textarea name="comments" rows={2} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3">
        {tasks.map((task) => {
          const isAssignedToMe = !task.assignedToId || task.assignedToId === userId;
          const canEdit = canAdmin || isAssignedToMe;
          return (
            <form
              key={task.id}
              action={updateDesignProjectTaskAction}
              className="bg-white rounded-lg shadow p-4 space-y-3"
            >
              <input type="hidden" name="id" value={task.id} />
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm text-gray-500">Tarea</div>
                  {canAdmin ? (
                    <input
                      name="title"
                      defaultValue={task.title}
                      required
                      className="mt-1 w-full border rounded px-3 py-2 text-sm"
                    />
                  ) : (
                    <div className="text-lg font-semibold text-gray-900">{task.title}</div>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  Responsable: {task.assignedTo?.name || task.assignedTo?.email || "Sin asignar"}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {canAdmin ? (
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Responsable</label>
                    <select
                      name="assignedToId"
                      defaultValue={task.assignedToId || ""}
                      className="mt-1 w-full border rounded px-3 py-2 text-sm"
                    >
                      <option value="">Sin asignar</option>
                      {architects.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name || a.email}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div>
                  <label className="text-sm font-semibold text-gray-700">Fecha limite</label>
                  {canAdmin ? (
                    <input
                      name="dueDate"
                      type="date"
                      defaultValue={formatDate(task.dueDate)}
                      className="mt-1 w-full border rounded px-3 py-2 text-sm"
                    />
                  ) : (
                    <div className="mt-2 text-sm text-gray-700">
                      {task.dueDate ? formatDate(task.dueDate) : "-"}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Prioridad</label>
                  {canAdmin ? (
                    <input
                      name="priority"
                      type="number"
                      min={1}
                      max={9}
                      defaultValue={task.priority}
                      className="mt-1 w-full border rounded px-3 py-2 text-sm"
                    />
                  ) : (
                    <div className="mt-2 text-sm text-gray-700">{task.priority}</div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Estatus</label>
                  <select
                    name="status"
                    defaultValue={task.status}
                    className="mt-1 w-full border rounded px-3 py-2 text-sm"
                    disabled={!canEdit}
                  >
                    {STATUS_VALUES.map((s) => (
                      <option key={s} value={s}>
                        {String(s).replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">Comentarios</label>
                <textarea
                  name="comments"
                  rows={2}
                  defaultValue={task.comments || ""}
                  className="mt-1 w-full border rounded px-3 py-2 text-sm"
                  disabled={!canEdit}
                />
              </div>

              {canEdit && (
                <div>
                  <button className="px-3 py-2 rounded bg-gray-900 text-white text-sm font-semibold">
                    Guardar cambios
                  </button>
                </div>
              )}
            </form>
          );
        })}
        {tasks.length === 0 && (
          <div className="text-sm text-gray-500">No hay tareas registradas.</div>
        )}
      </div>
    </div>
  );
}
