-- Add tasaVES (exchange rate) to payroll payments so historic totals remain stable.
ALTER TABLE "PayrollPayment" ADD COLUMN IF NOT EXISTS "tasaVES" DECIMAL(10,2);

-- Backfill: use the current SiteSettings.tasaVES for existing payments.
UPDATE "PayrollPayment"
SET "tasaVES" = (SELECT "tasaVES" FROM "SiteSettings" WHERE "id" = 1)
WHERE "tasaVES" IS NULL;

-- Optional: keep it non-null going forward (commented out to avoid failing on legacy rows).
-- ALTER TABLE "PayrollPayment" ALTER COLUMN "tasaVES" SET NOT NULL;
