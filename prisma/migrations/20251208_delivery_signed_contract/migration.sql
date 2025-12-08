-- Add field to store signed delivery contract URL
ALTER TABLE "public"."User"
ADD COLUMN IF NOT EXISTS "deliverySignedContractUrl" TEXT;

