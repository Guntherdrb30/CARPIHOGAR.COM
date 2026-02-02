"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Best-effort: ensure SiteSettings has new columns in DBs that missed migrations
export async function ensureSiteSettingsColumns() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "public"."SiteSettings" ' +
        'ADD COLUMN IF NOT EXISTS "deleteSecret" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "defaultMarginClientPct" DECIMAL(5,2), ' +
        'ADD COLUMN IF NOT EXISTS "defaultMarginAllyPct" DECIMAL(5,2), ' +
        'ADD COLUMN IF NOT EXISTS "defaultMarginWholesalePct" DECIMAL(5,2), ' +
        'ADD COLUMN IF NOT EXISTS "globalPriceAdjustmentPercent" DECIMAL(6,2) DEFAULT 0, ' +
        'ADD COLUMN IF NOT EXISTS "globalPriceAdjustmentEnabled" BOOLEAN NOT NULL DEFAULT false, ' +
        'ADD COLUMN IF NOT EXISTS "priceAdjustmentUSDPercent" DECIMAL(6,2) DEFAULT 0, ' +
        'ADD COLUMN IF NOT EXISTS "priceAdjustmentVESPercent" DECIMAL(6,2) DEFAULT 0, ' +
        'ADD COLUMN IF NOT EXISTS "priceAdjustmentByCurrencyEnabled" BOOLEAN NOT NULL DEFAULT false, ' +
        'ADD COLUMN IF NOT EXISTS "categoryPriceAdjustments" JSONB, ' +
        'ADD COLUMN IF NOT EXISTS "usdPaymentDiscountPercent" DECIMAL(6,2) DEFAULT 20, ' +
        'ADD COLUMN IF NOT EXISTS "usdPaymentDiscountEnabled" BOOLEAN NOT NULL DEFAULT true, ' +
        'ADD COLUMN IF NOT EXISTS "ecommerceIvaEnabled" BOOLEAN NOT NULL DEFAULT true, ' +
        'ADD COLUMN IF NOT EXISTS "vesSalesDisabled" BOOLEAN NOT NULL DEFAULT false, ' +
        'ADD COLUMN IF NOT EXISTS "heroAutoplayMs" INTEGER, ' +
        'ADD COLUMN IF NOT EXISTS "slaWarningDays" DECIMAL(6,2) DEFAULT 7, ' +
        'ADD COLUMN IF NOT EXISTS "slaCriticalOverdueDays" DECIMAL(6,2) DEFAULT 3, ' +
        'ADD COLUMN IF NOT EXISTS "ecpdHeroUrls" TEXT[], ' +
        'ADD COLUMN IF NOT EXISTS "moodboardHeroUrls" TEXT[], ' +
        'ADD COLUMN IF NOT EXISTS "ecpdColors" JSONB, ' +
        'ADD COLUMN IF NOT EXISTS "instagramHandle" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "tiktokHandle" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "categoryBannerCarpinteriaUrl" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "categoryBannerHogarUrl" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "paymentZelleEmail" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "paymentPmPhone" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "paymentPmRif" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "paymentPmBank" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "paymentBanescoAccount" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "paymentBanescoRif" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "paymentBanescoName" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "paymentMercantilAccount" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "paymentMercantilRif" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "paymentMercantilName" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "supportHours" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "legalCompanyName" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "legalCompanyRif" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "legalCompanyAddress" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "legalCompanyPhone" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "invoiceNextNumber" INTEGER, ' +
        'ADD COLUMN IF NOT EXISTS "receiptNextNumber" INTEGER, ' +
        'ADD COLUMN IF NOT EXISTS "deliveryMotoRatePerKmUSD" DECIMAL(10,4), ' +
        'ADD COLUMN IF NOT EXISTS "deliveryCarRatePerKmUSD" DECIMAL(10,4), ' +
        'ADD COLUMN IF NOT EXISTS "deliveryVanRatePerKmUSD" DECIMAL(10,4), ' +
        'ADD COLUMN IF NOT EXISTS "deliveryMotoMinFeeUSD" DECIMAL(10,2), ' +
        'ADD COLUMN IF NOT EXISTS "deliveryVanMinFeeUSD" DECIMAL(10,2), ' +
        'ADD COLUMN IF NOT EXISTS "deliveryDriverSharePct" DECIMAL(5,2), ' +
        'ADD COLUMN IF NOT EXISTS "deliveryCompanySharePct" DECIMAL(5,2)'
    );
  } catch {}
}

async function ensureAdminSettingsAuditLogTable() {
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "public"."AdminSettingsAuditLog" (' +
        '"id" TEXT NOT NULL, ' +
        '"settingKey" TEXT NOT NULL, ' +
        '"oldValue" TEXT, ' +
        '"newValue" TEXT, ' +
        '"changedByUserId" TEXT, ' +
        '"changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
        '"ipAddress" TEXT, ' +
        '"userAgent" TEXT, ' +
        'CONSTRAINT "AdminSettingsAuditLog_pkey" PRIMARY KEY ("id"), ' +
        'CONSTRAINT "AdminSettingsAuditLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE' +
      ')'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "AdminSettingsAuditLog_changedAt_idx" ON "public"."AdminSettingsAuditLog"("changedAt")'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "AdminSettingsAuditLog_settingKey_idx" ON "public"."AdminSettingsAuditLog"("settingKey")'
    );
  } catch {}
}

function parseBcvHtml(html: string): number | null {
  const marker = 'id="dolar"';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const snippet = html.slice(idx, idx + 1200);
  const m = snippet.match(/<strong>\s*([\d.,]+)\s*<\/strong>/i);
  if (!m) return null;
  const raw = m[1].trim();
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = parseFloat(normalized);
  if (!isFinite(value) || value <= 0) return null;
  return value;
}

// Obtiene la tasa BCV (Bs/USD) desde la página oficial o proxies confiables
async function fetchBcvRate(): Promise<number | null> {
  try {
    try {
      const apiRes = await fetch("https://pydolarve.org/api/v1/dollar?page=bcv", {
        cache: "no-store",
      });
      if (apiRes.ok) {
        const data: any = await apiRes.json();
        const candidates: any[] = [];
        if (data?.monitors?.bcv?.price != null) candidates.push(data.monitors.bcv.price);
        if (data?.monitors?.BCV?.price != null) candidates.push(data.monitors.BCV.price);
        if (data?.bcv?.price != null) candidates.push(data.bcv.price);
        if (data?.BCV?.price != null) candidates.push(data.BCV.price);
        const normalized = candidates
          .map((v) => {
            if (typeof v === "number") return Number.isFinite(v) ? v : null;
            if (typeof v === "string") {
              const cleaned = v.replace(/\./g, "").replace(",", ".");
              const parsed = Number(cleaned);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })
          .find((v) => typeof v === "number" && isFinite(v) && v > 0);
        if (typeof normalized === "number") return normalized;
      }
    } catch (e) {
      console.error("[fetchBcvRate] pydolarve API failed", String(e));
    }

    const htmlSources = [
      "https://www.bcv.org.ve",
      "https://r.jina.ai/http://www.bcv.org.ve",
      "https://r.jina.ai/http://bcv.org.ve",
    ];
    for (const source of htmlSources) {
      try {
        const res = await fetch(source, { cache: "no-store" });
        if (!res.ok) continue;
        const html = await res.text();
        const parsed = parseBcvHtml(html);
        if (parsed) return parsed;
      } catch (err) {
        console.error(`[fetchBcvRate] failed to parse HTML from ${source}`, String(err));
      }
    }

    const rafnixSources = [
      "https://r.jina.ai/http://bcv-api.rafnixg.dev/rates/",
      "https://bcv-api.rafnixg.dev/rates/",
    ];
    for (const source of rafnixSources) {
      try {
        const res = await fetch(source, { cache: "no-store" });
        if (!res.ok) {
          console.error("[fetchBcvRate] rafnixg fallback API returned", res.status);
          continue;
        }
        const text = await res.text();
        const jsonStart = text.indexOf("{");
        const jsonEnd = text.lastIndexOf("}");
        if (jsonStart === -1 || jsonEnd === -1) continue;
        const rawJson = text.slice(jsonStart, jsonEnd + 1);
        try {
          const data = JSON.parse(rawJson) as any;
          const altVal =
            Number(data?.dollar) ||
            Number(data?.value) ||
            Number(data?.rate) ||
            Number(data?.BCV) ||
            Number(data?.bcv);
          if (Number.isFinite(altVal) && altVal > 0) {
            console.info("[fetchBcvRate] using rafnixg fallback API", altVal);
            return altVal;
          }
        } catch (jsonErr) {
          console.error("[fetchBcvRate] failed to parse rafnixg JSON", String(jsonErr));
        }
      } catch (err) {
        console.error("[fetchBcvRate] rafnixg fallback API failed", String(err));
      }
    }

    return null;
  } catch {
    return null;
  }
}
async function applyBcvRate({
  rate,
  auditAction,
  userId,
}: {
  rate: number;
  auditAction: string;
  userId?: string | null;
}) {
  const updated = await prisma.siteSettings.update({
    where: { id: 1 },
    data: { tasaVES: rate as any },
  });
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: auditAction,
        details: `tasaVES=${rate}`,
      },
    });
  } catch {}
  try {
    revalidatePath("/dashboard/admin/ajustes/sistema");
    revalidatePath("/dashboard/admin/ajustes");
    revalidatePath("/dashboard/admin/ventas");
    revalidatePath("/dashboard/admin/compras");
    revalidatePath("/checkout/revisar");
  } catch {}
  return updated;
}

export async function getSettings() {
  await ensureSiteSettingsColumns();
  try {
    let settings = await prisma.siteSettings.findUnique({
      where: { id: 1 },
    });

    if (!settings) {
      settings = await prisma.siteSettings.create({
        data: {
          id: 1,
          brandName: "Carpihogar.ai",
          whatsappPhone: "584120000000",
          contactPhone: "584120000000",
          contactEmail: "contacto@carpihogar.ai",
          ivaPercent: 16,
          tasaVES: 40,
          primaryColor: "#FF4D00",
          secondaryColor: "#111827",
          logoUrl: "/logo-default.svg",
          homeHeroUrls: [],
          heroAutoplayMs: 5000 as any,
          lowStockThreshold: 5,
          slaWarningDays: 7,
          slaCriticalOverdueDays: 3,
          sellerCommissionPercent: 5,
        } as any,
      });
    }

    // Auto-actualizar mejor-esfuerzo la tasa BCV para que siempre refleje el valor oficial reciente
    try {
      const current = Number((settings as any).tasaVES || 0) || 0;
      const rate = await fetchBcvRate();
      if (rate && isFinite(rate) && rate > 0 && Math.abs(rate - current) > 0.0001) {
        settings = await prisma.siteSettings.update({
          where: { id: 1 },
          data: { tasaVES: rate as any },
        });
      }
    } catch {
      // Si falla BCV, seguimos usando la tasa guardada
    }

    const result = {
      ...settings,
      ivaPercent: settings.ivaPercent.toNumber(),
      tasaVES: settings.tasaVES.toNumber(),
      sellerCommissionPercent: settings.sellerCommissionPercent.toNumber(),
      defaultMarginClientPct: (settings as any).defaultMarginClientPct?.toNumber?.() ?? 40,
      defaultMarginAllyPct: (settings as any).defaultMarginAllyPct?.toNumber?.() ?? 30,
      defaultMarginWholesalePct: (settings as any).defaultMarginWholesalePct?.toNumber?.() ?? 20,
      ecommerceIvaEnabled: toBoolSafe((settings as any).ecommerceIvaEnabled, true),
      vesSalesDisabled: Boolean((settings as any).vesSalesDisabled ?? false),
      heroAutoplayMs: Number((settings as any).heroAutoplayMs ?? 5000) || 5000,
      slaWarningDays: (settings as any).slaWarningDays?.toNumber?.() ?? 7,
      slaCriticalOverdueDays: (settings as any).slaCriticalOverdueDays?.toNumber?.() ?? 3,
      moodboardHeroUrls: Array.isArray((settings as any).moodboardHeroUrls)
        ? ((settings as any).moodboardHeroUrls as any[]).filter(Boolean)
        : [],
      ecpdHeroUrls: Array.isArray((settings as any).ecpdHeroUrls)
        ? ((settings as any).ecpdHeroUrls as any[]).filter(Boolean)
        : [],
      ecpdColors: Array.isArray((settings as any).ecpdColors)
        ? (settings as any).ecpdColors
        : [
            {
              name: 'Arena',
              description: 'Melamina tono arena, base neutra y c&aacute;lida.',
              image: '',
            },
            {
              name: 'Nogal oscuro',
              description: 'Melamina efecto madera nogal oscuro, elegante y profunda.',
              image: '',
            },
            {
              name: 'Gris claro',
              description: 'Melamina gris claro, combinable con la mayor&iacute;a de estilos.',
              image: '',
            },
          ],
      categoryBannerCarpinteriaUrl: (settings as any).categoryBannerCarpinteriaUrl || "",
      categoryBannerHogarUrl: (settings as any).categoryBannerHogarUrl || "",
      paymentZelleEmail: (settings as any).paymentZelleEmail || "",
      paymentPmPhone: (settings as any).paymentPmPhone || "",
      paymentPmRif: (settings as any).paymentPmRif || "",
      paymentPmBank: (settings as any).paymentPmBank || "",
      paymentBanescoAccount: (settings as any).paymentBanescoAccount || "",
      paymentBanescoRif: (settings as any).paymentBanescoRif || "",
      paymentBanescoName: (settings as any).paymentBanescoName || "",
      paymentMercantilAccount: (settings as any).paymentMercantilAccount || "",
      paymentMercantilRif: (settings as any).paymentMercantilRif || "",
      paymentMercantilName: (settings as any).paymentMercantilName || "",
      supportHours: (settings as any).supportHours || "Lun-Vie 9:00-18:00",
      legalCompanyName: (settings as any).legalCompanyName || "Trends172, C.A",
      legalCompanyRif: (settings as any).legalCompanyRif || "J-31758009-5",
      legalCompanyAddress:
        (settings as any).legalCompanyAddress ||
        "Av. Industrial, Edificio Teka, Ciudad Barinas, Estado Barinas",
      legalCompanyPhone: (settings as any).legalCompanyPhone || "04245192679",
      // Delivery local defaults
      deliveryMotoRatePerKmUSD: (settings as any).deliveryMotoRatePerKmUSD?.toNumber?.() ?? 0.5,
      deliveryCarRatePerKmUSD: (settings as any).deliveryCarRatePerKmUSD?.toNumber?.() ?? 0.75,
      deliveryVanRatePerKmUSD: (settings as any).deliveryVanRatePerKmUSD?.toNumber?.() ?? 1,
      deliveryMotoMinFeeUSD: (settings as any).deliveryMotoMinFeeUSD?.toNumber?.() ?? 4,
      deliveryVanMinFeeUSD: (settings as any).deliveryVanMinFeeUSD?.toNumber?.() ?? 10,
      deliveryDriverSharePct: (settings as any).deliveryDriverSharePct?.toNumber?.() ?? 70,
      deliveryCompanySharePct: (settings as any).deliveryCompanySharePct?.toNumber?.() ?? 30,
      invoiceNextNumber: Number((settings as any).invoiceNextNumber ?? 1) || 1,
      receiptNextNumber: Number((settings as any).receiptNextNumber ?? 1) || 1,
    } as any;
    // Remove pricing adjustment settings from public payloads
    delete result.globalPriceAdjustmentPercent;
    delete result.globalPriceAdjustmentEnabled;
    delete result.priceAdjustmentUSDPercent;
    delete result.priceAdjustmentVESPercent;
    delete result.priceAdjustmentByCurrencyEnabled;
    delete result.categoryPriceAdjustments;
    delete result.usdPaymentDiscountPercent;
    delete result.usdPaymentDiscountEnabled;
    return result;
  } catch (err) {
    console.warn("[getSettings] DB not reachable, using defaults.", err);
    return {
      id: 1,
      brandName: "Carpihogar.ai",
      whatsappPhone: "584120000000",
      contactPhone: "584120000000",
      contactEmail: "contacto@carpihogar.ai",
      ivaPercent: 16,
      tasaVES: 40,
      primaryColor: "#FF4D00",
      secondaryColor: "#111827",
      logoUrl: "/logo-default.svg",
      homeHeroUrls: [],
      heroAutoplayMs: 5000,
      slaWarningDays: 7,
      slaCriticalOverdueDays: 3,
      ecpdHeroUrls: [],
      moodboardHeroUrls: [],
      ecpdColors: [
        { name: 'Arena', description: '', image: '' },
        { name: 'Nogal oscuro', description: '', image: '' },
        { name: 'Gris claro', description: '', image: '' },
      ],
      lowStockThreshold: 5,
      sellerCommissionPercent: 5,
      defaultMarginClientPct: 40,
      defaultMarginAllyPct: 30,
      defaultMarginWholesalePct: 20,
      ecommerceIvaEnabled: true,
      vesSalesDisabled: false,
      categoryBannerCarpinteriaUrl: "",
      categoryBannerHogarUrl: "",
      paymentZelleEmail: "",
      paymentPmPhone: "",
      paymentPmRif: "",
      paymentPmBank: "",
      paymentBanescoAccount: "",
      paymentBanescoRif: "",
      paymentBanescoName: "",
      paymentMercantilAccount: "",
      paymentMercantilRif: "",
      paymentMercantilName: "",
      supportHours: "Lun-Vie 9:00-18:00",
      legalCompanyName: "Trends172, C.A",
      legalCompanyRif: "J-31758009-5",
      legalCompanyAddress:
        "Av. Industrial, Edificio Teka, Ciudad Barinas, Estado Barinas",
      legalCompanyPhone: "04245192679",
      deliveryMotoRatePerKmUSD: 0.5,
      deliveryCarRatePerKmUSD: 0.75,
      deliveryVanRatePerKmUSD: 1,
      deliveryMotoMinFeeUSD: 4,
      deliveryVanMinFeeUSD: 10,
      deliveryDriverSharePct: 70,
      deliveryCompanySharePct: 30,
      invoiceNextNumber: 1,
      receiptNextNumber: 1,
    } as any;
  }
}

export async function setPaymentInstructions(formData: FormData) {
  await ensureSiteSettingsColumns();
  const session = await getServerSession(authOptions);
  const email = (session?.user as any)?.email as string | undefined;
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  if (!isAdmin || String(email || "").toLowerCase() !== rootEmail) {
    throw new Error("Not authorized");
  }
  const data = {
    paymentZelleEmail: String(formData.get("paymentZelleEmail") || ""),
    paymentPmPhone: String(formData.get("paymentPmPhone") || ""),
    paymentPmRif: String(formData.get("paymentPmRif") || ""),
    paymentPmBank: String(formData.get("paymentPmBank") || ""),
    paymentBanescoAccount: String(formData.get("paymentBanescoAccount") || ""),
    paymentBanescoRif: String(formData.get("paymentBanescoRif") || ""),
    paymentBanescoName: String(formData.get("paymentBanescoName") || ""),
    paymentMercantilAccount: String(formData.get("paymentMercantilAccount") || ""),
    paymentMercantilRif: String(formData.get("paymentMercantilRif") || ""),
    paymentMercantilName: String(formData.get("paymentMercantilName") || ""),
  } as any;
  await prisma.siteSettings.update({ where: { id: 1 }, data });
  revalidatePath("/dashboard/admin/ajustes/sistema");
  try {
    revalidatePath("/checkout/revisar");
  } catch {}
  return { ok: true };
}

export async function setDeliverySettings(formData: FormData) {
  await ensureSiteSettingsColumns();
  const session = await getServerSession(authOptions);
  const email = (session?.user as any)?.email as string | undefined;
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  if (!isAdmin || String(email || "").toLowerCase() !== rootEmail) {
    throw new Error("Not authorized");
  }

  const toNum = (name: string, def: number): number => {
    const raw = String(formData.get(name) || "").replace(",", ".").trim();
    if (!raw) return def;
    const n = Number(raw);
    return isFinite(n) && n >= 0 ? n : def;
  };

  const motoRate = toNum("deliveryMotoRatePerKmUSD", 0.5);
  const carRate = toNum("deliveryCarRatePerKmUSD", 0.75);
  const vanRate = toNum("deliveryVanRatePerKmUSD", 1);
  const motoMin = toNum("deliveryMotoMinFeeUSD", 4);
  const vanMin = toNum("deliveryVanMinFeeUSD", 10);
  const driverPct = toNum("deliveryDriverSharePct", 70);
  const companyPct = toNum("deliveryCompanySharePct", 30);

  await prisma.siteSettings.update({
    where: { id: 1 },
    data: {
      deliveryMotoRatePerKmUSD: motoRate as any,
      deliveryCarRatePerKmUSD: carRate as any,
      deliveryVanRatePerKmUSD: vanRate as any,
      deliveryMotoMinFeeUSD: motoMin as any,
      deliveryVanMinFeeUSD: vanMin as any,
      deliveryDriverSharePct: driverPct as any,
      deliveryCompanySharePct: companyPct as any,
    },
  });

  revalidatePath("/dashboard/admin/ajustes/sistema");
  try {
    revalidatePath("/dashboard/admin/delivery");
    revalidatePath("/dashboard/admin/delivery/dashboard");
    revalidatePath("/dashboard/admin/delivery/liquidaciones");
  } catch {}
  return { ok: true };
}

export async function setLegalBillingSettings(formData: FormData) {
  await ensureSiteSettingsColumns();
  const session = await getServerSession(authOptions);
  const email = (session?.user as any)?.email as string | undefined;
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  if (!isAdmin || String(email || "").toLowerCase() !== rootEmail) {
    throw new Error("Not authorized");
  }

  const legalCompanyName = String(formData.get("legalCompanyName") || "").trim();
  const legalCompanyRif = String(formData.get("legalCompanyRif") || "").trim();
  const legalCompanyAddress = String(formData.get("legalCompanyAddress") || "").trim();
  const legalCompanyPhone = String(formData.get("legalCompanyPhone") || "").trim();

  const invoiceNextRaw = String(formData.get("invoiceNextNumber") || "").trim();
  const receiptNextRaw = String(formData.get("receiptNextNumber") || "").trim();
  const invoiceNextNumber = invoiceNextRaw ? Number(invoiceNextRaw) : undefined;
  const receiptNextNumber = receiptNextRaw ? Number(receiptNextRaw) : undefined;

  const data: any = {
    legalCompanyName: legalCompanyName || null,
    legalCompanyRif: legalCompanyRif || null,
    legalCompanyAddress: legalCompanyAddress || null,
    legalCompanyPhone: legalCompanyPhone || null,
  };
  if (invoiceNextNumber && isFinite(invoiceNextNumber) && invoiceNextNumber > 0) {
    data.invoiceNextNumber = invoiceNextNumber;
  }
  if (receiptNextNumber && isFinite(receiptNextNumber) && receiptNextNumber > 0) {
    data.receiptNextNumber = receiptNextNumber;
  }

  await prisma.siteSettings.update({ where: { id: 1 }, data });
  try {
    await prisma.auditLog.create({
      data: {
        userId: (session?.user as any)?.id,
        action: "LEGAL_BILLING_SETTINGS_UPDATED",
        details: `invoiceNext=${data.invoiceNextNumber ?? "-"};receiptNext=${data.receiptNextNumber ?? "-"}`,
      },
    });
  } catch {}

  revalidatePath("/dashboard/admin/ajustes/sistema");
  return { ok: true };
}

// Actualiza la tasa VES desde el BCV (admin, botÃ³n manual)
export async function refreshTasaFromBCV() {
  await ensureSiteSettingsColumns();
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  const rate = await fetchBcvRate();
  if (!rate) {
    throw new Error("No se pudo obtener la tasa del BCV");
  }
  await applyBcvRate({
    rate,
    auditAction: "BCV_RATE_REFRESHED",
    userId: (session?.user as any)?.id,
  });
  return { ok: true, tasaVES: rate };
}

// Cron/automÃ¡tico (protegido por token en /api/cron/update-bcv)
export async function refreshTasaFromBCVCron(): Promise<{
  ok: boolean;
  tasaVES?: number;
  error?: string;
}> {
  await ensureSiteSettingsColumns();
  try {
    const rate = await fetchBcvRate();
    if (!rate) {
      try {
        await prisma.auditLog.create({
          data: {
            userId: null,
            action: "BCV_RATE_CRON_FAILED",
            details: "fetchBcvRate() devolvi\u00f3 null",
          },
        });
      } catch {}
      return { ok: false, error: "No se pudo obtener la tasa del BCV" };
    }
    await applyBcvRate({ rate, auditAction: "BCV_RATE_CRON", userId: null });
    return { ok: true, tasaVES: rate };
  } catch (e: any) {
    const msg = String(e?.message || e || "Error desconocido");
    try {
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: "BCV_RATE_CRON_FAILED",
          details: msg,
        },
      });
    } catch {}
    return { ok: false, error: msg };
  }
}

// Carga manual de emergencia (campo en ajustes)
export async function setTasaManual(tasa: number) {
  await ensureSiteSettingsColumns();
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  const rate = Number(tasa);
  if (!isFinite(rate) || rate <= 0) throw new Error("Tasa invÃ¡lida");
  await applyBcvRate({
    rate,
    auditAction: "BCV_RATE_MANUAL",
    userId: (session?.user as any)?.id,
  });
  return { ok: true, tasaVES: rate };
}

export async function updateSettings(data: any) {
  const session = await getServerSession(authOptions);

  if ((session?.user as any)?.role !== "ADMIN") {
    throw new Error("Not authorized");
  }

  const email = String((session?.user as any)?.email || "").toLowerCase();
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  const isRoot = email === rootEmail;

  // La tasa oficial (tasaVES) se gestiona solo vÃ­a BCV o setTasaManual
    const cleaned = { ...(data || {}) } as any;
    delete cleaned.tasaVES;
  
    const urlsIn = Array.isArray(cleaned?.homeHeroUrls)
      ? (cleaned.homeHeroUrls as string[]).filter(Boolean)
      : [];
    const ecpdUrlsIn = Array.isArray(cleaned?.ecpdHeroUrls)
      ? (cleaned.ecpdHeroUrls as string[]).filter(Boolean)
      : [];
    const moodboardUrlsIn = Array.isArray(cleaned?.moodboardHeroUrls)
      ? (cleaned.moodboardHeroUrls as string[]).filter(Boolean)
      : [];
  const isVideo = (u: string) => {
    const s = String(u || "").toLowerCase();
    return s.endsWith(".mp4") || s.endsWith(".webm") || s.endsWith(".ogg");
  };
  if (urlsIn.length > 1 && isVideo(urlsIn[0])) {
    const idx = urlsIn.findIndex((u) => !isVideo(u));
    if (idx > 0) {
      const t = urlsIn[0];
      urlsIn[0] = urlsIn[idx];
      urlsIn[idx] = t;
    }
  }
    const msRaw = Number(cleaned?.heroAutoplayMs ?? 5000);
    const heroAutoplayMs = !isNaN(msRaw) && msRaw > 0 ? Math.min(Math.max(msRaw, 1000), 120000) : 5000;
  
    const prepared = {
      ...cleaned,
      homeHeroUrls: urlsIn,
      ecpdHeroUrls: ecpdUrlsIn,
      moodboardHeroUrls: moodboardUrlsIn,
      heroAutoplayMs,
      categoryBannerCarpinteriaUrl: cleaned.categoryBannerCarpinteriaUrl || null,
      categoryBannerHogarUrl: cleaned.categoryBannerHogarUrl || null,
  } as any;
  if (isRoot) {
    prepared.ecommerceIvaEnabled = toBoolSafe(cleaned.ecommerceIvaEnabled, true);
  } else {
    delete prepared.ecommerceIvaEnabled;
  }

  const settings = await prisma.siteSettings.update({
    where: { id: 1 },
    data: prepared,
  });

  revalidatePath("/dashboard/admin/ajustes");
  try {
    revalidatePath("/", "layout" as any);
    revalidatePath("/");
    revalidateTag("featured-category-banners");
  } catch {}
  return settings;
}

export async function getAuditLogs(params?: { take?: number; actions?: string[] }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  const where: any = {};
  if (params?.actions?.length) where.action = { in: params.actions } as any;
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: params?.take ?? 50,
  });
  return logs;
}

export async function getDeleteSecret(): Promise<string> {
  const settings = await getSettings();
  const fromDb = (settings as any).deleteSecret || "";
  if (fromDb && fromDb.trim()) return String(fromDb);
  const fromEnv =
    process.env.RECEIVABLE_DELETE_SECRET || process.env.ADMIN_DELETE_SECRET || "";
  return fromEnv;
}

export async function setDeleteSecret(formData: FormData) {
  await ensureSiteSettingsColumns();
  const session = await getServerSession(authOptions);
  const email = (session?.user as any)?.email as string | undefined;
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  if ((session?.user as any)?.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  if (String(email || "").toLowerCase() !== rootEmail) {
    throw new Error("Solo el usuario root puede cambiar esta clave");
  }
  const newSecret = String(formData.get("newSecret") || "").trim();
  const confirm = String(formData.get("confirm") || "").trim();
  if (!newSecret || newSecret.length < 6) {
    throw new Error("La clave debe tener al menos 6 caracteres");
  }
  if (newSecret !== confirm) {
    throw new Error("Las claves no coinciden");
  }
  try {
    await prisma.siteSettings.update({ where: { id: 1 }, data: { deleteSecret: newSecret } });
  } catch (err) {
    await prisma.siteSettings.create({
      data: {
        id: 1,
        brandName: "Carpihogar.ai",
        whatsappPhone: "584120000000",
        contactPhone: "584120000000",
        contactEmail: "contacto@carpihogar.ai",
        ivaPercent: 16 as any,
        tasaVES: 40 as any,
        primaryColor: "#FF4D00",
        secondaryColor: "#111827",
        logoUrl: "/logo-default.svg",
        homeHeroUrls: [],
        lowStockThreshold: 5,
        sellerCommissionPercent: 5 as any,
        deleteSecret: newSecret,
      } as any,
    });
  }
  try {
    await prisma.auditLog.create({
      data: {
        userId: (session?.user as any)?.id,
        action: "SYSTEM_DELETE_SECRET_UPDATED",
        details: `by:${email}`,
      },
    });
  } catch {}
  revalidatePath("/dashboard/admin/ajustes/sistema");
  return { ok: true };
}

export async function setDefaultMargins(formData: FormData) {
  await ensureSiteSettingsColumns();
  const session = await getServerSession(authOptions);
  const email = (session?.user as any)?.email as string | undefined;
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  if ((session?.user as any)?.role !== "ADMIN" || String(email || "").toLowerCase() !== rootEmail) {
    throw new Error("Not authorized");
  }
  const clientPct = Number(String(formData.get("defaultMarginClientPct") || ""));
  const allyPct = Number(String(formData.get("defaultMarginAllyPct") || ""));
  const wholesalePct = Number(String(formData.get("defaultMarginWholesalePct") || ""));
  if ([clientPct, allyPct, wholesalePct].some((v) => isNaN(v) || v < 0)) {
    throw new Error("Valores invÃ¡lidos");
  }
  await prisma.siteSettings.update({
    where: { id: 1 },
    data: {
      defaultMarginClientPct: clientPct as any,
      defaultMarginAllyPct: allyPct as any,
      defaultMarginWholesalePct: wholesalePct as any,
    },
  });
  try {
    await prisma.auditLog.create({
      data: {
        userId: (session?.user as any)?.id,
        action: "DEFAULT_MARGINS_SET",
        details: `client:${clientPct};ally:${allyPct};wholesale:${wholesalePct}`,
      },
    });
  } catch {}
  revalidatePath("/dashboard/admin/ajustes/sistema");
  return { ok: true };
}

const toNumberSafe = (value: any, fallback = 0) => {
  try {
    if (value == null) return fallback;
    if (typeof value === "number") return isFinite(value) ? value : fallback;
    if (typeof value?.toNumber === "function") {
      const n = value.toNumber();
      return isFinite(n) ? n : fallback;
    }
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};

const toBoolSafe = (value: any, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "on" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "off" || v === "no") return false;
  }
  return fallback;
};

const stableJson = (value: Record<string, any>) => {
  const keys = Object.keys(value || {}).sort();
  const ordered: Record<string, any> = {};
  for (const k of keys) ordered[k] = value[k];
  return JSON.stringify(ordered);
};

const getClientMeta = () => {
  try {
    const h = headers();
    const forwarded = h.get("x-forwarded-for") || "";
    const ip = forwarded.split(",")[0]?.trim() || h.get("x-real-ip") || "";
    const userAgent = h.get("user-agent") || "";
    return { ipAddress: ip || null, userAgent: userAgent || null };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
};

export async function getPriceAdjustmentSettingsRoot() {
  await ensureSiteSettingsColumns();
  const session = await getServerSession(authOptions);
  const email = String((session?.user as any)?.email || "").toLowerCase();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  if (!isAdmin || email !== rootEmail) throw new Error("Not authorized");

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const raw = (settings || {}) as any;
  const categoryMap =
    raw.categoryPriceAdjustments && typeof raw.categoryPriceAdjustments === "object"
      ? raw.categoryPriceAdjustments
      : {};

  return {
    globalPriceAdjustmentPercent: toNumberSafe(raw.globalPriceAdjustmentPercent, 0),
    globalPriceAdjustmentEnabled: toBoolSafe(raw.globalPriceAdjustmentEnabled, false),
    priceAdjustmentUSDPercent: toNumberSafe(raw.priceAdjustmentUSDPercent, 0),
    priceAdjustmentVESPercent: toNumberSafe(raw.priceAdjustmentVESPercent, 0),
    priceAdjustmentByCurrencyEnabled: toBoolSafe(raw.priceAdjustmentByCurrencyEnabled, false),
    categoryPriceAdjustments: categoryMap,
    usdPaymentDiscountPercent: toNumberSafe(raw.usdPaymentDiscountPercent, 20),
    usdPaymentDiscountEnabled: toBoolSafe(raw.usdPaymentDiscountEnabled, true),
    vesSalesDisabled: toBoolSafe(raw.vesSalesDisabled, false),
  } as any;
}

export async function getPriceAdjustmentAuditLogs(params?: { take?: number }) {
  await ensureAdminSettingsAuditLogTable();
  const session = await getServerSession(authOptions);
  const email = String((session?.user as any)?.email || "").toLowerCase();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  if (!isAdmin || email !== rootEmail) throw new Error("Not authorized");

  const logs = await prisma.adminSettingsAuditLog.findMany({
    orderBy: { changedAt: "desc" },
    take: params?.take ?? 50,
    include: { changedBy: { select: { id: true, name: true, email: true } } },
  });
  return logs;
}

export async function setPriceAdjustments(formData: FormData) {
  await ensureSiteSettingsColumns();
  await ensureAdminSettingsAuditLogTable();
  const session = await getServerSession(authOptions);
  const email = String((session?.user as any)?.email || "").toLowerCase();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  if (!isAdmin || email !== rootEmail) throw new Error("Not authorized");

  const parsePercent = (name: string, fallback = 0) => {
    const raw = String(formData.get(name) || "").replace(",", ".").trim();
    if (!raw) return fallback;
    const n = Number(raw);
    return isFinite(n) ? n : fallback;
  };

  const globalPriceAdjustmentPercent = parsePercent("globalPriceAdjustmentPercent", 0);
  const globalPriceAdjustmentEnabled =
    String(formData.get("globalPriceAdjustmentEnabled") || "") === "on";
  const priceAdjustmentUSDPercent = parsePercent("priceAdjustmentUSDPercent", 0);
  const priceAdjustmentVESPercent = parsePercent("priceAdjustmentVESPercent", 0);
  const priceAdjustmentByCurrencyEnabled =
    String(formData.get("priceAdjustmentByCurrencyEnabled") || "") === "on";
  const usdPaymentDiscountPercent = parsePercent("usdPaymentDiscountPercent", 20);
  const usdPaymentDiscountEnabled =
    String(formData.get("usdPaymentDiscountEnabled") || "") === "on";
  const vesSalesDisabled =
    String(formData.get("vesSalesDisabled") || "") === "on";

  const categoryPriceAdjustments: Record<string, number> = {};
  for (const [key, value] of Array.from(formData.entries())) {
    if (!key.startsWith("categoryAdj_")) continue;
    const categoryId = key.replace("categoryAdj_", "");
    const raw = String(value || "").replace(",", ".").trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!isFinite(n)) continue;
    if (n !== 0) categoryPriceAdjustments[categoryId] = n;
  }

  await getSettings();
  const before = await prisma.siteSettings.findUnique({
    where: { id: 1 },
    select: {
      globalPriceAdjustmentPercent: true,
      globalPriceAdjustmentEnabled: true,
      priceAdjustmentUSDPercent: true,
      priceAdjustmentVESPercent: true,
      priceAdjustmentByCurrencyEnabled: true,
      categoryPriceAdjustments: true,
      usdPaymentDiscountPercent: true,
      usdPaymentDiscountEnabled: true,
      vesSalesDisabled: true,
    },
  });

  const data = {
    globalPriceAdjustmentPercent: globalPriceAdjustmentPercent as any,
    globalPriceAdjustmentEnabled,
    priceAdjustmentUSDPercent: priceAdjustmentUSDPercent as any,
    priceAdjustmentVESPercent: priceAdjustmentVESPercent as any,
    priceAdjustmentByCurrencyEnabled,
    categoryPriceAdjustments,
    usdPaymentDiscountPercent: usdPaymentDiscountPercent as any,
    usdPaymentDiscountEnabled,
    vesSalesDisabled,
  } as any;

  await prisma.siteSettings.update({ where: { id: 1 }, data });

  const changes: Array<{
    settingKey: string;
    oldValue: string | null;
    newValue: string | null;
  }> = [];
  const old = (before || {}) as any;
  const oldCategory = (old.categoryPriceAdjustments && typeof old.categoryPriceAdjustments === "object")
    ? old.categoryPriceAdjustments
    : {};

  const pushIfChanged = (key: string, oldVal: any, newVal: any) => {
    const oldNum = toNumberSafe(oldVal, 0);
    const newNum = toNumberSafe(newVal, 0);
    if (key.endsWith("Enabled")) {
      const oldBool = toBoolSafe(oldVal, false);
      const newBool = toBoolSafe(newVal, false);
      if (oldBool !== newBool) {
        changes.push({ settingKey: key, oldValue: String(oldBool), newValue: String(newBool) });
      }
      return;
    }
    if (oldNum !== newNum) {
      changes.push({ settingKey: key, oldValue: String(oldNum), newValue: String(newNum) });
    }
  };

  pushIfChanged("globalPriceAdjustmentPercent", old.globalPriceAdjustmentPercent, globalPriceAdjustmentPercent);
  pushIfChanged("globalPriceAdjustmentEnabled", old.globalPriceAdjustmentEnabled, globalPriceAdjustmentEnabled);
  pushIfChanged("priceAdjustmentUSDPercent", old.priceAdjustmentUSDPercent, priceAdjustmentUSDPercent);
  pushIfChanged("priceAdjustmentVESPercent", old.priceAdjustmentVESPercent, priceAdjustmentVESPercent);
  pushIfChanged("priceAdjustmentByCurrencyEnabled", old.priceAdjustmentByCurrencyEnabled, priceAdjustmentByCurrencyEnabled);
  pushIfChanged("usdPaymentDiscountPercent", old.usdPaymentDiscountPercent, usdPaymentDiscountPercent);
  pushIfChanged("usdPaymentDiscountEnabled", old.usdPaymentDiscountEnabled, usdPaymentDiscountEnabled);
  pushIfChanged("vesSalesDisabled", old.vesSalesDisabled, vesSalesDisabled);

  const oldCategoryJson = stableJson(oldCategory || {});
  const newCategoryJson = stableJson(categoryPriceAdjustments || {});
  if (oldCategoryJson !== newCategoryJson) {
    changes.push({
      settingKey: "categoryPriceAdjustments",
      oldValue: oldCategoryJson,
      newValue: newCategoryJson,
    });
  }

  const meta = getClientMeta();
  if (changes.length) {
    try {
      await prisma.adminSettingsAuditLog.createMany({
        data: changes.map((c) => ({
          ...c,
          changedByUserId: (session?.user as any)?.id || null,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        })),
      });
    } catch {}
  }

  try {
    revalidatePath("/");
    revalidatePath("/productos");
    revalidatePath("/dashboard/admin/ajustes");
    revalidatePath("/dashboard/admin/ajustes/sistema");
    revalidatePath("/dashboard/admin/ventas");
    revalidatePath("/dashboard/admin/presupuestos");
    revalidatePath("/checkout/revisar");
  } catch {}
  return { ok: true };
}
