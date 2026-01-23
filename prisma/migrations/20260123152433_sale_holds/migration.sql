CREATE TABLE "SaleHold" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "sellerId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerTaxId" TEXT,
    "customerFiscalAddress" TEXT,
    "items" JSONB NOT NULL,
    "meta" JSONB,
    "totalUSD" DECIMAL(12,2),

    CONSTRAINT "SaleHold_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SaleHold_createdById_idx" ON "SaleHold"("createdById");
CREATE INDEX "SaleHold_sellerId_idx" ON "SaleHold"("sellerId");
CREATE INDEX "SaleHold_createdAt_idx" ON "SaleHold"("createdAt");

ALTER TABLE "SaleHold" ADD CONSTRAINT "SaleHold_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleHold" ADD CONSTRAINT "SaleHold_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
