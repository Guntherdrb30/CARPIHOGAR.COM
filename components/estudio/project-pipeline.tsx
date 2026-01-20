import { DesignProjectStage } from "@prisma/client";
import { updateDesignProjectStageAction } from "@/server/actions/design-projects";

const STAGES = [
  { key: "BRIEFING", label: "Briefing" },
  { key: "PROPUESTA", label: "Propuesta" },
  { key: "RENDERS", label: "Renders" },
  { key: "REVISION", label: "Revision" },
  { key: "AJUSTES", label: "Ajustes" },
  { key: "ENTREGA", label: "Entrega" },
];

export default function ProjectPipeline({
  projectId,
  stage,
  canUpdate,
}: {
  projectId: string;
  stage: DesignProjectStage | string;
  canUpdate: boolean;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Etapas del diseno</h2>
        <span className="text-sm text-gray-500">{String(stage).replace(/_/g, " ")}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {STAGES.map((s) => {
          const active = s.key === stage;
          return (
            <div
              key={s.key}
              className={`rounded border px-2 py-2 text-xs text-center ${
                active
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-gray-50 text-gray-600 border-gray-200"
              }`}
            >
              {s.label}
            </div>
          );
        })}
      </div>
      {canUpdate && (
        <form action={updateDesignProjectStageAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={projectId} />
          <select name="stage" defaultValue={stage} className="border rounded px-3 py-2 text-sm">
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="px-3 py-2 rounded bg-gray-900 text-white text-sm font-semibold">
            Actualizar etapa
          </button>
        </form>
      )}
    </div>
  );
}
