-- Add kitchen price tiers and new kitchen categories
ALTER TYPE "KitchenCategory" ADD VALUE IF NOT EXISTS 'FRIDGE';
ALTER TYPE "KitchenCategory" ADD VALUE IF NOT EXISTS 'CONDIMENT';

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "kitchenPriceLowUsd" NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS "kitchenPriceMidUsd" NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS "kitchenPriceHighUsd" NUMERIC(10,2);