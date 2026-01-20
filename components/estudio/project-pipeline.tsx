import { DesignProjectStage } from "@prisma/client";
import { updateDesignProjectStageAction } from "@/server/actions/design-projects";
import SlaBadge from "@/components/estudio/sla-badge";
import { DEFAULT_SLA_CONFIG, getSlaStatus, SLA_STAGE_CLASSES, SlaConfig } from "@/lib/sla";

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
  dueDate,
  slaConfig,
}: {
  projectId: string;
  stage: DesignProjectStage | string;
  canUpdate: boolean;
  dueDate?: Date | string | null;
  slaConfig?: SlaConfig;
}) {
  const status = getSlaStatus(dueDate ?? null, slaConfig ?? DEFAULT_SLA_CONFIG);
  const formatDate = (value?: Date | string | null) => {
    if (!value) return "-";
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return "-";
    }
  };
  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Etapas del diseno</h2>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-sm text-gray-500">{String(stage).replace(/_/g, " ")}</span>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Entrega: {formatDate(dueDate)}</span>
            <SlaBadge dueDate={dueDate ?? null} config={slaConfig} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {STAGES.map((s) => {
          const active = s.key === stage;
          const activeCls = SLA_STAGE_CLASSES[status] || SLA_STAGE_CLASSES.none;
          return (
            <div
              key={s.key}
              className={`rounded border px-2 py-2 text-xs text-center ${
                active
                  ? activeCls
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
