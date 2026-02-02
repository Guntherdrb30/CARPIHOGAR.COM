CREATE TABLE "CarpentryProjectUpdate" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "progressDate" TIMESTAMPTZ NOT NULL,
  "phase" TEXT NOT NULL,
  "responsibleEmployeeId" TEXT,
  "imageUrl" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CarpentryProjectUpdate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CarpentryProject"("id") ON DELETE CASCADE,
  CONSTRAINT "CarpentryProjectUpdate_responsibleEmployeeId_fkey" FOREIGN KEY ("responsibleEmployeeId") REFERENCES "PayrollEmployee"("id") ON UPDATE NO ACTION,
  CONSTRAINT "CarpentryProjectUpdate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON UPDATE NO ACTION
);

CREATE INDEX "CarpentryProjectUpdate_projectId_index" ON "CarpentryProjectUpdate" ("projectId");
CREATE INDEX "CarpentryProjectUpdate_responsibleEmployeeId_index" ON "CarpentryProjectUpdate" ("responsibleEmployeeId");
