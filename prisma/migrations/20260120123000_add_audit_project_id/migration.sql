ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE INDEX IF NOT EXISTS "AuditLog_projectId_createdAt_idx"
  ON "AuditLog"("projectId", "createdAt");
