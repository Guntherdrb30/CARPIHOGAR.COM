-- Kitchen space measurements
CREATE TABLE IF NOT EXISTS "public"."KitchenSpace" (
  "id" TEXT NOT NULL,
  "kitchenId" TEXT NOT NULL,
  "wallName" TEXT NOT NULL,
  "widthMm" INTEGER NOT NULL,
  "heightMm" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KitchenSpace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KitchenSpace_kitchenId_idx" ON "public"."KitchenSpace"("kitchenId");
CREATE UNIQUE INDEX IF NOT EXISTS "KitchenSpace_kitchenId_wallName_key" ON "public"."KitchenSpace"("kitchenId", "wallName");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KitchenSpace_kitchenId_fkey'
  ) THEN
    ALTER TABLE "public"."KitchenSpace"
      ADD CONSTRAINT "KitchenSpace_kitchenId_fkey"
      FOREIGN KEY ("kitchenId") REFERENCES "public"."KitchenDesign"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
