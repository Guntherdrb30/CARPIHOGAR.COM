export type SlaStatus = "green" | "yellow" | "orange" | "red" | "none";

export type SlaConfig = {
  warningDays: number;
  criticalOverdueDays: number;
};

export const DEFAULT_SLA_CONFIG: SlaConfig = {
  warningDays: 7,
  criticalOverdueDays: 3,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toNumber = (value: any, fallback: number) => {
  if (value == null) return fallback;
  if (typeof value === "number") return isFinite(value) ? value : fallback;
  if (typeof value?.toNumber === "function") {
    const n = value.toNumber();
    return isFinite(n) ? n : fallback;
  }
  const n = Number(String(value).replace(",", "."));
  return isFinite(n) ? n : fallback;
};

export function getSlaConfigFromSettings(settings: any): SlaConfig {
  const warningDays = Math.max(
    0,
    toNumber((settings as any)?.slaWarningDays, DEFAULT_SLA_CONFIG.warningDays)
  );
  const criticalOverdueDays = Math.max(
    0,
    toNumber((settings as any)?.slaCriticalOverdueDays, DEFAULT_SLA_CONFIG.criticalOverdueDays)
  );
  return { warningDays, criticalOverdueDays };
}

export function getSlaStatus(
  dueDate: Date | string | null | undefined,
  config: SlaConfig = DEFAULT_SLA_CONFIG,
  now: Date = new Date()
): SlaStatus {
  if (!dueDate) return "none";
  const due = typeof dueDate === "string" ? new Date(dueDate) : new Date(dueDate);
  if (!isFinite(due.getTime())) return "none";
  const diffDays = (due.getTime() - now.getTime()) / MS_PER_DAY;
  if (diffDays > config.warningDays) return "green";
  if (diffDays >= 0) return "yellow";
  const overdueDays = Math.abs(diffDays);
  if (overdueDays <= config.criticalOverdueDays) return "orange";
  return "red";
}

export const SLA_LABELS: Record<SlaStatus, string> = {
  green: "En tiempo",
  yellow: "Por vencer",
  orange: "Vencido leve",
  red: "Vencido critico",
  none: "Sin fecha",
};

export const SLA_BADGE_CLASSES: Record<SlaStatus, string> = {
  green: "bg-green-50 text-green-700 border-green-200",
  yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  red: "bg-red-50 text-red-700 border-red-200",
  none: "bg-gray-100 text-gray-600 border-gray-200",
};

export const SLA_STAGE_CLASSES: Record<SlaStatus, string> = {
  green: "bg-green-600 text-white border-green-600",
  yellow: "bg-yellow-500 text-gray-900 border-yellow-500",
  orange: "bg-orange-500 text-white border-orange-500",
  red: "bg-red-600 text-white border-red-600",
  none: "bg-blue-600 text-white border-blue-600",
};
