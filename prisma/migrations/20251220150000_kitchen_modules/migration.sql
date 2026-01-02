-- Kitchen modules placed on design
CREATE TABLE IF NOT EXISTS "public"."KitchenModule" (
  "id" TEXT NOT NULL,
  "kitchenId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "positionX" INTEGER NOT NULL,
  "positionY" INTEGER NOT NULL,
  "widthMm" INTEGER NOT NULL,
  "depthMm" INTEGER NOT NULL,
  "lockedHeight" INTEGER NOT NULL,
  "priceCalculatedUsd" DECIMAL(12, 2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KitchenModule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KitchenModule_kitchenId_idx" ON "public"."KitchenModule"("kitchenId");
CREATE INDEX IF NOT EXISTS "KitchenModule_productId_idx" ON "public"."KitchenModule"("productId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KitchenModule_kitchenId_fkey'
  ) THEN
    ALTER TABLE "public"."KitchenModule"
      ADD CONSTRAINT "KitchenModule_kitchenId_fkey"
      FOREIGN KEY ("kitchenId") REFERENCES "public"."KitchenDesign"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KitchenModule_productId_fkey'
  ) THEN
    ALTER TABLE "public"."KitchenModule"
      ADD CONSTRAINT "KitchenModule_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "public"."Product"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
