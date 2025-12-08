-- Campos para confirmaciones, valoraciones y propinas en envíos locales (DELIVERY)
ALTER TABLE "public"."Shipping"
ADD COLUMN IF NOT EXISTS "clientConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deliveryConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "clientRating" INTEGER,
ADD COLUMN IF NOT EXISTS "deliveryRating" INTEGER,
ADD COLUMN IF NOT EXISTS "tipUSD" NUMERIC(10,2);

