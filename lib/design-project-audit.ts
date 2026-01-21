import prisma from "@/lib/prisma";

type DesignProjectAuditInput = {
  projectId: string;
  userId?: string | null;
  action: string;
  details?: string | null;
};

export async function logDesignProjectAudit({
  projectId,
  userId,
  action,
  details,
}: DesignProjectAuditInput) {
  if (!projectId || !action) return;
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        details: details || null,
        projectId,
      },
    });
  } catch {}
}
