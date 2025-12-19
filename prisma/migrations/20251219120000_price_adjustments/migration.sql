-- Add price adjustment fields to SiteSettings
ALTER TABLE "public"."SiteSettings"
  ADD COLUMN IF NOT EXISTS "globalPriceAdjustmentPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "globalPriceAdjustmentEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "priceAdjustmentUSDPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "priceAdjustmentVESPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "priceAdjustmentByCurrencyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "categoryPriceAdjustments" JSONB,
  ADD COLUMN IF NOT EXISTS "usdPaymentDiscountPercent" DECIMAL(6,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "usdPaymentDiscountEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AdminSettingsAuditLog table
CREATE TABLE IF NOT EXISTS "public"."AdminSettingsAuditLog" (
  "id" TEXT NOT NULL,
  "settingKey" TEXT NOT NULL,
  "oldValue" TEXT,
  "newValue" TEXT,
  "changedByUserId" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "AdminSettingsAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminSettingsAuditLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AdminSettingsAuditLog_changedAt_idx" ON "public"."AdminSettingsAuditLog"("changedAt");
CREATE INDEX IF NOT EXISTS "AdminSettingsAuditLog_settingKey_idx" ON "public"."AdminSettingsAuditLog"("settingKey");
