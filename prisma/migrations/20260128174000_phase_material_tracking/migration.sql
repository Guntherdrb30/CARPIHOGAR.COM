ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'CORTE_CANTEADO';
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'ARMADO_ESTRUCTURA';
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'ARMADO_PUERTAS';
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'INSTALACION_HERRAJES';
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'EMBALAJE';
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'ALMACEN';

ALTER TABLE "CarpentryProjectMaterialList"
  ADD COLUMN IF NOT EXISTS "phase" "CarpentryProjectPhase";

ALTER TABLE "CarpentryProjectMaterialList"
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

ALTER TABLE "CarpentryProjectMaterialList"
  ADD COLUMN IF NOT EXISTS "deliveredById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'CarpentryProjectMaterialList_deliveredById_fkey'
      AND table_name = 'CarpentryProjectMaterialList'
  ) THEN
    ALTER TABLE "CarpentryProjectMaterialList"
      ADD CONSTRAINT "CarpentryProjectMaterialList_deliveredById_fkey"
      FOREIGN KEY ("deliveredById") REFERENCES "PayrollEmployee" ("id") ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS "CarpentryProjectMaterialList_deliveredById_index"
  ON "CarpentryProjectMaterialList" ("deliveredById");
