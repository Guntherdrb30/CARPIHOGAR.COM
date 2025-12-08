/**
 * Run: npm run delivery:db:setup
 * Aplica la estructura necesaria para:
 * - Tabla Branch (sucursales)
 * - Relación User.branchId y Shipping.branchId
 * - Campos lat/lng en Address
 * - Parámetros de delivery por km en SiteSettings
 *
 * Usa DATABASE_URL de tu .env (Neon en tu caso).
 */

/* eslint-disable no-console */

const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  // SQL idempotente: se puede ejecutar varias veces sin romper
  const sql = `
  -- 1) Tabla de sucursales (Branch)
  CREATE TABLE IF NOT EXISTS "public"."Branch" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL UNIQUE,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "motoRatePerKmUSD" DECIMAL(10,4),
    "carRatePerKmUSD" DECIMAL(10,4),
    "vanRatePerKmUSD" DECIMAL(10,4),
    "motoMinFeeUSD" DECIMAL(10,2),
    "vanMinFeeUSD" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
  );

  -- 2) User.branchId
  ALTER TABLE "public"."User"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'User_branch_fkey'
    ) THEN
      ALTER TABLE "public"."User"
      ADD CONSTRAINT "User_branch_fkey"
      FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL;
    END IF;
  END$$;

  -- 3) Shipping.branchId
  ALTER TABLE "public"."Shipping"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'Shipping_branch_fkey'
    ) THEN
      ALTER TABLE "public"."Shipping"
      ADD CONSTRAINT "Shipping_branch_fkey"
      FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL;
    END IF;
  END$$;

  -- 4) Address.lat / Address.lng
  ALTER TABLE "public"."Address"
  ADD COLUMN IF NOT EXISTS "lat" DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "lng" DECIMAL(10,7);

  -- 5) Campos de configuración global de delivery en SiteSettings
  ALTER TABLE "public"."SiteSettings"
  ADD COLUMN IF NOT EXISTS "deliveryMotoRatePerKmUSD" DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS "deliveryCarRatePerKmUSD" DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS "deliveryVanRatePerKmUSD" DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS "deliveryMotoMinFeeUSD" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "deliveryVanMinFeeUSD" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "deliveryDriverSharePct" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "deliveryCompanySharePct" DECIMAL(5,2);
  `;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Delivery schema applied successfully.');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    console.error('Error applying delivery schema:', e && e.message ? e.message : e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

