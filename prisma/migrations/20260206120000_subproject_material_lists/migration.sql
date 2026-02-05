ALTER TABLE "CarpentryProjectMaterialList" ADD COLUMN "subprojectId" TEXT;

CREATE INDEX "CarpentryProjectMaterialList_subprojectId_index" ON "CarpentryProjectMaterialList" ("subprojectId");

ALTER TABLE "CarpentryProjectMaterialList"
  ADD CONSTRAINT "CarpentryProjectMaterialList_subprojectId_fkey"
  FOREIGN KEY ("subprojectId") REFERENCES "CarpentrySubproject" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "CarpentryProjectPurchaseOrder" ADD COLUMN "subprojectId" TEXT;

CREATE INDEX "CarpentryProjectPurchaseOrder_subprojectId_index" ON "CarpentryProjectPurchaseOrder" ("subprojectId");

ALTER TABLE "CarpentryProjectPurchaseOrder"
  ADD CONSTRAINT "CarpentryProjectPurchaseOrder_subprojectId_fkey"
  FOREIGN KEY ("subprojectId") REFERENCES "CarpentrySubproject" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
