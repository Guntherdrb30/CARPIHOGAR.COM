import {
  DEFAULT_SLA_CONFIG,
  getSlaStatus,
  SLA_BADGE_CLASSES,
  SLA_LABELS,
  SlaConfig,
  SlaStatus,
} from "@/lib/sla";

export default function SlaBadge({
  dueDate,
  config,
  status,
  className,
  showWhenNone = true,
}: {
  dueDate?: Date | string | null;
  config?: SlaConfig;
  status?: SlaStatus;
  className?: string;
  showWhenNone?: boolean;
}) {
  const resolved =
    status ?? getSlaStatus(dueDate ?? null, config ?? DEFAULT_SLA_CONFIG);
  if (!showWhenNone && resolved === "none") return null;
  const label = SLA_LABELS[resolved];
  const cls = SLA_BADGE_CLASSES[resolved];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls} ${
        className || ""
      }`}
    >
      {label}
    </span>
  );
}
