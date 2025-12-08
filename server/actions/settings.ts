"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Best-effort: ensure SiteSettings has new columns in DBs that missed migrations
async function ensureSiteSettingsColumns() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "public"."SiteSettings" ' +
        'ADD COLUMN IF NOT EXISTS "deleteSecret" TEXT, ' +
        'ADD COLUMN IF NOT EXISTS "defaultMarginClientPct" DECIMAL(5,2), ' +
        'ADD COLUMN IF NOT EXISTS "defaultMarginAllyPct" DECIMAL(5,2), ' +
        'ADD COLUMN IF NOT EXISTS "defaultMarginWholesalePct" DECIMAL(5,2), ' +
        'ADD COLUMN IF NOT EXISTS "heroAutoplayMs" INTEGER, ' +
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

// Obtiene la tasa BCV (Bs/USD) desde la página oficial
async function fetchBcvRate(): Promise<number | null> {
  try {
    // 1) Intentar primero una API externa (pydolarve) para obtener la tasa BCV en JSON
    try {
      const apiRes = await fetch(
        "https://pydolarve.org/api/v1/dollar?page=bcv",
        { cache: "no-store" }
      );
      if (apiRes.ok) {
        const data: any = await apiRes.json();
        const candidates: any[] = [];
        if (data?.monitors?.bcv?.price != null)
          candidates.push(data.monitors.bcv.price);
        if (data?.monitors?.BCV?.price != null)
          candidates.push(data.monitors.BCV.price);
        if (data?.bcv?.price != null) candidates.push(data.bcv.price);
        if (data?.BCV?.price != null) candidates.push(data.BCV.price);
        const num = candidates.find(
          (v) => typeof v === "number" && isFinite(v) && v > 0
        );
        if (typeof num === "number") {
          return Number(num);
        }
      }
    } catch {
      // Si falla esta fuente, seguimos con el HTML oficial del BCV
    }

    // 2) Fallback: scrapping directo de la p�gina del BCV
    const res = await fetch("https://www.bcv.org.ve", { cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
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

    return {
      ...settings,
      ivaPercent: settings.ivaPercent.toNumber(),
      tasaVES: settings.tasaVES.toNumber(),
      sellerCommissionPercent: settings.sellerCommissionPercent.toNumber(),
      defaultMarginClientPct: (settings as any).defaultMarginClientPct?.toNumber?.() ?? 40,
      defaultMarginAllyPct: (settings as any).defaultMarginAllyPct?.toNumber?.() ?? 30,
      defaultMarginWholesalePct: (settings as any).defaultMarginWholesalePct?.toNumber?.() ?? 20,
      heroAutoplayMs: Number((settings as any).heroAutoplayMs ?? 5000) || 5000,
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

// Actualiza la tasa VES desde el BCV (admin, botón manual)
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

// Cron/automático (protegido por token en /api/cron/update-bcv)
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
  if (!isFinite(rate) || rate <= 0) throw new Error("Tasa inválida");
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

  // La tasa oficial (tasaVES) se gestiona solo vía BCV o setTasaManual
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
    throw new Error("Valores inválidos");
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
