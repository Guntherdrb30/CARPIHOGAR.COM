-- Product usage flags for future modules
ALTER TABLE "public"."Product"
  ADD COLUMN IF NOT EXISTS "usableInQuickBudget" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "usableInKitchenDesigner" BOOLEAN NOT NULL DEFAULT false;
