-- Create new payment plan enum
CREATE TYPE "CarpentryProjectPaymentPlan" AS ENUM ('ESTANDAR', 'PARCIAL');

-- Add column to projects
ALTER TABLE "CarpentryProject"
ADD COLUMN "paymentPlan" "CarpentryProjectPaymentPlan" NOT NULL DEFAULT 'ESTANDAR';

-- Create subproject status enum
CREATE TYPE "CarpentrySubprojectStatus" AS ENUM ('PENDIENTE', 'FABRICANDO', 'INSTALANDO', 'COMPLETADO');

-- Subprojects table
CREATE TABLE "CarpentrySubproject" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "totalUSD" DECIMAL(12, 2) NOT NULL,
  "fabricationPaidUSD" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "installationPaidUSD" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "status" "CarpentrySubprojectStatus" NOT NULL DEFAULT 'PENDIENTE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  FOREIGN KEY ("projectId") REFERENCES "CarpentryProject" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX "CarpentrySubproject_projectId_index" ON "CarpentrySubproject" ("projectId");

-- Subproject payments history table
CREATE TABLE "CarpentrySubprojectPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subprojectId" TEXT NOT NULL,
  "amountUSD" DECIMAL(12, 2) NOT NULL,
  "phase" "CarpentryProjectPhase" NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "method" "PaymentMethod",
  "reference" TEXT,
  "notes" TEXT,
  "proofUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  FOREIGN KEY ("subprojectId") REFERENCES "CarpentrySubproject" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX "CarpentrySubprojectPayment_subprojectId_index" ON "CarpentrySubprojectPayment" ("subprojectId");

-- Production order link to subproject
ALTER TABLE "ProductionOrder"
ADD COLUMN "subprojectId" TEXT;
ALTER TABLE "ProductionOrder"
ADD CONSTRAINT "ProductionOrder_subprojectId_fkey"
FOREIGN KEY ("subprojectId") REFERENCES "CarpentrySubproject" ("id") ON UPDATE NO ACTION;
CREATE INDEX "ProductionOrder_subprojectId_index" ON "ProductionOrder" ("subprojectId");
