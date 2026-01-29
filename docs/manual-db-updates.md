# Actualización manual de la base de datos (Neon)

Prisma `migrate deploy` está fallando en Vercel porque la base de datos está bloqueada por un `pg_advisory_lock`. Mientras resolvemos esa condición, ejecuta los siguientes comandos directamente en el editor SQL de Neon (o cualquier cliente con conexión a la misma base):

1. **Añadir las fases de fabricación** al `enum` `CarpentryProjectPhase` (el mismo comando es seguro si algún valor ya existe):

```sql
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'CORTE_CANTEADO';
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'ARMADO_ESTRUCTURA';
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'ARMADO_PUERTAS';
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'INSTALACION_HERRAJES';
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'EMBALAJE';
ALTER TYPE "CarpentryProjectPhase" ADD VALUE IF NOT EXISTS 'ALMACEN';
```

2. **Añadir columnas** utilizadas por el seguimiento de entregas:

```sql
ALTER TABLE "CarpentryProjectMaterialList"
  ADD COLUMN IF NOT EXISTS "phase" "CarpentryProjectPhase";

ALTER TABLE "CarpentryProjectMaterialList"
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

ALTER TABLE "CarpentryProjectMaterialList"
  ADD COLUMN IF NOT EXISTS "deliveredById" TEXT;
```

3. **Crear la relación hacia `PayrollEmployee`** y el índice asociado:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'CarpentryProjectMaterialList_deliveredById_fkey'
      AND table_name = 'CarpentryProjectMaterialList'
  ) THEN
    ALTER TABLE "CarpentryProjectMaterialList"
      ADD CONSTRAINT "CarpentryProjectMaterialList_deliveredById_fkey"
      FOREIGN KEY ("deliveredById") REFERENCES "PayrollEmployee" ("id") ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS "CarpentryProjectMaterialList_deliveredById_index"
  ON "CarpentryProjectMaterialList" ("deliveredById");
```

Después de ejecutar estas instrucciones, vuelve a correr `npx prisma generate` y comprueba el estado del despliegue. Si se vuelve a producir el timeout en `migrate deploy`, puedes intentar ejecutar `npx prisma migrate deploy --skip-generate` y asegurarte de que no haya otra sesión bloqueando la base de datos antes de volver a ejecutar el comando completo.

## Inventario derivado y entregas
Cuando agregues el nuevo módulo de inventario para proyectos, crea también estas tres tablas auxiliares antes de volver a desplegar:

```sql
CREATE TABLE IF NOT EXISTS "CarpentryProjectInventoryEntry" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "CarpentryProject" ("id") ON DELETE CASCADE,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "CarpentryProjectPurchaseOrder" ("id") ON DELETE CASCADE,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL UNIQUE REFERENCES "OrderItem" ("id") ON DELETE RESTRICT,
  "itemName" TEXT NOT NULL,
  "sku" TEXT,
  "productId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "remainingQuantity" INTEGER NOT NULL DEFAULT 0,
  "unitPriceUSD" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CarpentryProjectInventoryEntry_projectId_index" ON "CarpentryProjectInventoryEntry" ("projectId");
CREATE INDEX IF NOT EXISTS "CarpentryProjectInventoryEntry_purchaseOrderId_index" ON "CarpentryProjectInventoryEntry" ("purchaseOrderId");
```

```sql
CREATE TABLE IF NOT EXISTS "CarpentryProjectInventoryDelivery" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "CarpentryProject" ("id") ON DELETE CASCADE,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "CarpentryProjectPurchaseOrder" ("id") ON DELETE CASCADE,
  "phase" "CarpentryProjectPhase",
  "notes" TEXT,
  "deliveredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deliveredById" TEXT REFERENCES "PayrollEmployee" ("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CarpentryProjectInventoryDelivery_projectId_index" ON "CarpentryProjectInventoryDelivery" ("projectId");
CREATE INDEX IF NOT EXISTS "CarpentryProjectInventoryDelivery_purchaseOrderId_index" ON "CarpentryProjectInventoryDelivery" ("purchaseOrderId");
```

```sql
CREATE TABLE IF NOT EXISTS "CarpentryProjectInventoryDeliveryItem" (
  "id" TEXT PRIMARY KEY,
  "deliveryId" TEXT NOT NULL REFERENCES "CarpentryProjectInventoryDelivery" ("id") ON DELETE CASCADE,
  "entryId" TEXT NOT NULL REFERENCES "CarpentryProjectInventoryEntry" ("id") ON DELETE RESTRICT,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CarpentryProjectInventoryDeliveryItem_entryId_index" ON "CarpentryProjectInventoryDeliveryItem" ("entryId");
```

Al final, vuelve a ejecutar `npx prisma generate`. Si el deploy de Vercel sigue fallando en las migraciones, aplica estas sentencias antes de reintentar para que la base ya tenga todas las tablas necesarias.
