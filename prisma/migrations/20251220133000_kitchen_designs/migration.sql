-- Kitchen design enums
DO $$ BEGIN
  CREATE TYPE "public"."KitchenLayoutType" AS ENUM (
    'LINEAL',
    'L_SHAPE',
    'DOUBLE_LINE',
    'LINEAL_WITH_ISLAND',
    'L_WITH_ISLAND',
    'L_WITH_PENINSULA',
    'CUSTOM_SPACE'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."KitchenDesignStatus" AS ENUM ('DRAFT', 'SAVED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Kitchen designs table
CREATE TABLE IF NOT EXISTS "public"."KitchenDesign" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "layoutType" "public"."KitchenLayoutType" NOT NULL,
  "status" "public"."KitchenDesignStatus" NOT NULL DEFAULT 'DRAFT',
  "totalPriceUsd" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "planJson" JSONB,
  "modulesJson" JSONB,
  "budgetJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KitchenDesign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KitchenDesign_userId_updatedAt_idx" ON "public"."KitchenDesign"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "KitchenDesign_userId_status_idx" ON "public"."KitchenDesign"("userId", "status");

ALTER TABLE "public"."KitchenDesign"
ADD CONSTRAINT IF NOT EXISTS "KitchenDesign_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
