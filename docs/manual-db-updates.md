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
