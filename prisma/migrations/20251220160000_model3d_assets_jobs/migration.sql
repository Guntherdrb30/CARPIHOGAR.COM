-- 3D asset/job status enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Model3DAssetStatus') THEN
    CREATE TYPE "public"."Model3DAssetStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'ERROR');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Model3DJobStatus') THEN
    CREATE TYPE "public"."Model3DJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'ERROR');
  END IF;
END $$;

-- 3D model assets per product
CREATE TABLE IF NOT EXISTS "public"."Model3DAsset" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "status" "public"."Model3DAssetStatus" NOT NULL DEFAULT 'PENDING',
  "originalFileName" TEXT NOT NULL,
  "originalFileMime" TEXT NOT NULL,
  "originalFileTempPath" TEXT,
  "glbPath" TEXT,
  "previewImagePath" TEXT,
  "processingError" TEXT,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Model3DAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Model3DAsset_productId_idx" ON "public"."Model3DAsset"("productId");

CREATE UNIQUE INDEX IF NOT EXISTS "Model3DAsset_productId_active_key"
  ON "public"."Model3DAsset"("productId")
  WHERE ("archived" = false);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Model3DAsset_productId_fkey'
  ) THEN
    ALTER TABLE "public"."Model3DAsset"
      ADD CONSTRAINT "Model3DAsset_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "public"."Product"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3D conversion jobs
CREATE TABLE IF NOT EXISTS "public"."Model3DJob" (
  "id" TEXT NOT NULL,
  "model3dAssetId" TEXT NOT NULL,
  "status" "public"."Model3DJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Model3DJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Model3DJob_model3dAssetId_idx" ON "public"."Model3DJob"("model3dAssetId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Model3DJob_model3dAssetId_fkey'
  ) THEN
    ALTER TABLE "public"."Model3DJob"
      ADD CONSTRAINT "Model3DJob_model3dAssetId_fkey"
      FOREIGN KEY ("model3dAssetId") REFERENCES "public"."Model3DAsset"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
