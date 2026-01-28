ALTER TYPE "CarpentryProjectFileType" ADD VALUE IF NOT EXISTS 'SOPORTE';
ALTER TABLE "CarpentryProjectFile" ADD COLUMN IF NOT EXISTS "description" TEXT;
