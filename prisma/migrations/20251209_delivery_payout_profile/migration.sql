-- Campos en User para datos de pago de delivery (transferencias y pago móvil)
ALTER TABLE "public"."User"
ADD COLUMN IF NOT EXISTS "deliverySignedContractUrl" TEXT,
ADD COLUMN IF NOT EXISTS "payoutBankName" TEXT,
ADD COLUMN IF NOT EXISTS "payoutBankAccount" TEXT,
ADD COLUMN IF NOT EXISTS "payoutBankIdNumber" TEXT,
ADD COLUMN IF NOT EXISTS "payoutPmBank" TEXT,
ADD COLUMN IF NOT EXISTS "payoutPmPhone" TEXT,
ADD COLUMN IF NOT EXISTS "payoutPmIdNumber" TEXT;

