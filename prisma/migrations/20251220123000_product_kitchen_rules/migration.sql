-- Kitchen category enum
DO $$ BEGIN
  CREATE TYPE "public"."KitchenCategory" AS ENUM ('LOW', 'HIGH', 'PANTRY', 'TOWER', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Product kitchen fields
ALTER TABLE "public"."Product"
  ADD COLUMN IF NOT EXISTS "kitchenCategory" "public"."KitchenCategory",
  ADD COLUMN IF NOT EXISTS "isVisibleInKitchenDesigner" BOOLEAN NOT NULL DEFAULT false;

-- Kitchen module validation rules
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_kitchen_module_rules'
  ) THEN
    ALTER TABLE "public"."Product"
      ADD CONSTRAINT "product_kitchen_module_rules"
      CHECK (
        "productFamily" <> 'KITCHEN_MODULE'
        OR (
          "heightMm" IS NOT NULL
          AND "heightMinMm" IS NULL
          AND "heightMaxMm" IS NULL
          AND "widthMinMm" IS NOT NULL
          AND "widthMaxMm" IS NOT NULL
          AND "widthMm" IS NOT NULL
          AND "widthMm" >= "widthMinMm"
          AND "widthMm" <= "widthMaxMm"
        )
      );
  END IF;
END $$;
