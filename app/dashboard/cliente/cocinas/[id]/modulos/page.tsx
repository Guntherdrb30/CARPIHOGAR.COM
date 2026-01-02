import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { calculateKitchenModulePrice, validateModulePlacement } from "@/server/kitchen-modules";

type KitchenModuleItem = {
  id: string;
  productId: string;
  positionX: number;
  positionY: number;
  widthMm: number;
  depthMm: number;
  lockedHeight: number;
  priceCalculatedUsd: number;
  product: {
    name: string;
    kitchenCategory: string | null;
    widthMinMm: number | null;
    widthMaxMm: number | null;
  };
};

const CATEGORY_LABELS: Record<string, string> = {
  LOW: "Muebles Bajos",
  HIGH: "Muebles Altos",
  TOWER: "Torres",
  PANTRY: "Alacenas / Despensas",
  OTHER: "Alacenas / Despensas",
};

const DISPLAY_CATEGORY: Record<string, string> = {
  LOW: "Bajo",
  HIGH: "Alto",
  TOWER: "Torre",
  PANTRY: "Alacena / Despensa",
  OTHER: "Otro",
};

const SECTION_ORDER = ["Muebles Bajos", "Muebles Altos", "Torres", "Alacenas / Despensas"];

const toNumberSafe = (value: any, fallback = 0) => {
  try {
    if (value == null) return fallback;
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value?.toNumber === "function") return value.toNumber();
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};

const formatMoney = (value: number) => `$${value.toFixed(2)}`;

export default async function KitchenModulesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const { id } = await params;
  const sp = (await searchParams) || {};
  const error = String((sp as any).error || "");

  if (!userId) {
    return <div className="p-4">Debes iniciar sesion para continuar.</div>;
  }

  const design = await (prisma as any).kitchenDesign.findFirst({
    where: { id, userId },
  });

  if (!design) {
    return (
      <div className="p-4 space-y-3">
        <div>No se encontro el diseno solicitado.</div>
        <Link href="/dashboard/cliente/cocinas" className="text-blue-600 hover:underline">
          Volver a Mis Disenos de Cocina
        </Link>
      </div>
    );
  }

  const allModules = await prisma.product.findMany({
    where: {
      productFamily: "KITCHEN_MODULE",
      usableInKitchenDesigner: true,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      kitchenCategory: true,
      widthMm: true,
      heightMm: true,
      depthMm: true,
      widthMinMm: true,
      widthMaxMm: true,
      basePriceUsd: true,
    },
  });

  const grouped: Record<string, typeof allModules> = {};
  for (const mod of allModules) {
    const category = String(mod.kitchenCategory || "OTHER");
    const section = CATEGORY_LABELS[category] || CATEGORY_LABELS.OTHER;
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(mod);
  }

  const kitchenModules = (await (prisma as any).kitchenModule.findMany({
    where: { kitchenId: design.id },
    orderBy: { createdAt: "asc" },
    include: {
      product: {
        select: {
          name: true,
          kitchenCategory: true,
          widthMinMm: true,
          widthMaxMm: true,
        },
      },
    },
  })) as KitchenModuleItem[];

  const budgetAggregate = await (prisma as any).kitchenModule.aggregate({
    where: { kitchenId: design.id },
    _sum: { priceCalculatedUsd: true },
  });
  const subtotalModules = toNumberSafe(budgetAggregate?._sum?.priceCalculatedUsd, 0);
  const totalModules = kitchenModules.length;

  async function addModule(formData: FormData) {
    "use server";
    const sessionInner = await getServerSession(authOptions);
    const userIdInner = (sessionInner?.user as any)?.id as string | undefined;
    if (!userIdInner) {
      redirect("/auth/login?callbackUrl=/dashboard/cliente/cocinas");
    }

    const productId = String(formData.get("productId") || "").trim();
    if (!productId) {
      redirect(`/dashboard/cliente/cocinas/${id}/modulos?error=Producto%20requerido`);
    }

    const designInner = await (prisma as any).kitchenDesign.findFirst({
      where: { id, userId: userIdInner },
      select: { id: true },
    });

    if (!designInner) {
      redirect(`/dashboard/cliente/cocinas?error=Diseno%20no%20encontrado`);
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        productFamily: "KITCHEN_MODULE",
        usableInKitchenDesigner: true,
      },
      select: {
        id: true,
        name: true,
        kitchenCategory: true,
        widthMm: true,
        heightMm: true,
        depthMm: true,
        widthMinMm: true,
        widthMaxMm: true,
        basePriceUsd: true,
        parametricPricingFormula: true,
        categoryId: true,
        supplier: { select: { chargeCurrency: true } },
      },
    });

    if (!product) {
      redirect(`/dashboard/cliente/cocinas/${id}/modulos?error=Producto%20no%20valido`);
    }

    const existingModules = await (prisma as any).kitchenModule.findMany({
      where: { kitchenId: designInner.id },
      select: { id: true, kitchenId: true, productId: true, positionX: true, positionY: true, widthMm: true },
    });

    const widthMin = product.widthMinMm != null ? Number(product.widthMinMm) : null;
    const widthMax = product.widthMaxMm != null ? Number(product.widthMaxMm) : null;
    let widthMm = product.widthMm != null ? Number(product.widthMm) : null;
    if (!widthMm || (widthMin != null && widthMm < widthMin) || (widthMax != null && widthMm > widthMax)) {
      widthMm = widthMin ?? widthMax ?? 0;
    }

    if (!widthMm || widthMm <= 0) {
      redirect(`/dashboard/cliente/cocinas/${id}/modulos?error=Ancho%20invalido`);
    }

    const positionY = 0;
    const maxEnd = existingModules.reduce((acc: number, item: any) => {
      if (Number(item.positionY) !== positionY) return acc;
      const end = Number(item.positionX) + Number(item.widthMm || 0);
      return end > acc ? end : acc;
    }, 0);
    const positionX = maxEnd;

    const validation = validateModulePlacement({
      draft: {
        productId: product.id,
        positionX,
        positionY,
        widthMm,
      },
      product: {
        id: product.id,
        productFamily: "KITCHEN_MODULE",
        basePriceUsd: product.basePriceUsd,
        parametricPricingFormula: product.parametricPricingFormula,
        widthMm: product.widthMm ?? null,
        heightMm: product.heightMm ?? null,
        depthMm: product.depthMm ?? null,
        widthMinMm: product.widthMinMm ?? null,
        widthMaxMm: product.widthMaxMm ?? null,
        heightMinMm: null,
        heightMaxMm: null,
        categoryId: product.categoryId ?? null,
        supplierCurrency: product.supplier?.chargeCurrency || null,
      },
      existing: existingModules,
    });

    if (validation.errors.length) {
      const firstError = validation.errors[0] || "Validacion fallida";
      redirect(`/dashboard/cliente/cocinas/${id}/modulos?error=${encodeURIComponent(firstError)}`);
    }

    const depthMm = toNumberSafe(product.depthMm, 0);
    const priceCalculatedUsd = await calculateKitchenModulePrice({
      product: {
        id: product.id,
        productFamily: "KITCHEN_MODULE",
        basePriceUsd: product.basePriceUsd,
        parametricPricingFormula: product.parametricPricingFormula,
        widthMm: product.widthMm ?? null,
        heightMm: product.heightMm ?? null,
        depthMm: product.depthMm ?? null,
        widthMinMm: product.widthMinMm ?? null,
        widthMaxMm: product.widthMaxMm ?? null,
        heightMinMm: null,
        heightMaxMm: null,
        categoryId: product.categoryId ?? null,
        supplierCurrency: product.supplier?.chargeCurrency || null,
      },
      widthMm: validation.normalized.widthMm,
    });

    await prisma.$transaction(async (tx) => {
      await (tx as any).kitchenModule.create({
        data: {
          kitchenId: designInner.id,
          productId: product.id,
          positionX: validation.normalized.positionX,
          positionY: validation.normalized.positionY,
          widthMm: validation.normalized.widthMm,
          depthMm: Math.round(depthMm),
          lockedHeight: validation.normalized.lockedHeight,
          priceCalculatedUsd: priceCalculatedUsd as any,
        },
      });

      const total = await (tx as any).kitchenModule.aggregate({
        where: { kitchenId: designInner.id },
        _sum: { priceCalculatedUsd: true },
      });
      const totalPriceUsd = toNumberSafe(total?._sum?.priceCalculatedUsd, 0);
      await (tx as any).kitchenDesign.update({
        where: { id: designInner.id },
        data: {
          totalPriceUsd: totalPriceUsd as any,
          budgetJson: {
            subtotalModules: totalPriceUsd,
            subtotalHardware: 0,
            total: totalPriceUsd,
          },
        },
      });
    });

    redirect(`/dashboard/cliente/cocinas/${id}/modulos`);
  }

  async function updateModule(formData: FormData) {
    "use server";
    const sessionInner = await getServerSession(authOptions);
    const userIdInner = (sessionInner?.user as any)?.id as string | undefined;
    if (!userIdInner) {
      redirect("/auth/login?callbackUrl=/dashboard/cliente/cocinas");
    }

    const kitchenId = String(formData.get("kitchenId") || "").trim();
    const moduleId = String(formData.get("moduleId") || "").trim();
    const widthMmInput = Number(formData.get("widthMm"));

    if (!kitchenId || !moduleId || !Number.isFinite(widthMmInput)) {
      redirect(`/dashboard/cliente/cocinas/${id}/modulos?error=Datos%20invalidos`);
    }

    const designInner = await (prisma as any).kitchenDesign.findFirst({
      where: { id: kitchenId, userId: userIdInner },
      select: { id: true },
    });
    if (!designInner) {
      redirect(`/dashboard/cliente/cocinas?error=Diseno%20no%20encontrado`);
    }

    const moduleRecord = await (prisma as any).kitchenModule.findFirst({
      where: { id: moduleId, kitchenId },
    });
    if (!moduleRecord) {
      redirect(`/dashboard/cliente/cocinas/${id}/modulos?error=Modulo%20no%20encontrado`);
    }

    const product = await prisma.product.findFirst({
      where: { id: moduleRecord.productId },
      select: {
        id: true,
        productFamily: true,
        basePriceUsd: true,
        parametricPricingFormula: true,
        widthMm: true,
        heightMm: true,
        depthMm: true,
        widthMinMm: true,
        widthMaxMm: true,
        categoryId: true,
        supplier: { select: { chargeCurrency: true } },
      },
    });
    if (!product) {
      redirect(`/dashboard/cliente/cocinas/${id}/modulos?error=Producto%20no%20valido`);
    }

    const existingModules = await (prisma as any).kitchenModule.findMany({
      where: { kitchenId },
      select: { id: true, kitchenId: true, productId: true, positionX: true, positionY: true, widthMm: true },
    });

    const validation = validateModulePlacement({
      draft: {
        id: moduleId,
        productId: moduleRecord.productId,
        positionX: moduleRecord.positionX,
        positionY: moduleRecord.positionY,
        widthMm: widthMmInput,
      },
      product: {
        id: product.id,
        productFamily: String(product.productFamily || "KITCHEN_MODULE"),
        basePriceUsd: product.basePriceUsd,
        parametricPricingFormula: product.parametricPricingFormula,
        widthMm: product.widthMm ?? null,
        heightMm: product.heightMm ?? null,
        depthMm: product.depthMm ?? null,
        widthMinMm: product.widthMinMm ?? null,
        widthMaxMm: product.widthMaxMm ?? null,
        heightMinMm: null,
        heightMaxMm: null,
        categoryId: product.categoryId ?? null,
        supplierCurrency: product.supplier?.chargeCurrency || null,
      },
      existing: existingModules,
    });

    if (validation.errors.length) {
      const firstError = validation.errors[0] || "Validacion fallida";
      redirect(`/dashboard/cliente/cocinas/${id}/modulos?error=${encodeURIComponent(firstError)}`);
    }

    const depthMm = toNumberSafe(product.depthMm, 0);
    const priceCalculatedUsd = await calculateKitchenModulePrice({
      product: {
        id: product.id,
        productFamily: String(product.productFamily || "KITCHEN_MODULE"),
        basePriceUsd: product.basePriceUsd,
        parametricPricingFormula: product.parametricPricingFormula,
        widthMm: product.widthMm ?? null,
        heightMm: product.heightMm ?? null,
        depthMm: product.depthMm ?? null,
        widthMinMm: product.widthMinMm ?? null,
        widthMaxMm: product.widthMaxMm ?? null,
        heightMinMm: null,
        heightMaxMm: null,
        categoryId: product.categoryId ?? null,
        supplierCurrency: product.supplier?.chargeCurrency || null,
      },
      widthMm: validation.normalized.widthMm,
    });

    await prisma.$transaction(async (tx) => {
      await (tx as any).kitchenModule.update({
        where: { id: moduleId },
        data: {
          widthMm: validation.normalized.widthMm,
          positionX: validation.normalized.positionX,
          positionY: validation.normalized.positionY,
          depthMm: Math.round(depthMm),
          lockedHeight: validation.normalized.lockedHeight,
          priceCalculatedUsd: priceCalculatedUsd as any,
        },
      });

      const total = await (tx as any).kitchenModule.aggregate({
        where: { kitchenId },
        _sum: { priceCalculatedUsd: true },
      });
      const totalPriceUsd = toNumberSafe(total?._sum?.priceCalculatedUsd, 0);
      await (tx as any).kitchenDesign.update({
        where: { id: kitchenId },
        data: {
          totalPriceUsd: totalPriceUsd as any,
          budgetJson: {
            subtotalModules: totalPriceUsd,
            subtotalHardware: 0,
            total: totalPriceUsd,
          },
        },
      });
    });

    redirect(`/dashboard/cliente/cocinas/${id}/modulos`);
  }

  async function deleteModule(formData: FormData) {
    "use server";
    const sessionInner = await getServerSession(authOptions);
    const userIdInner = (sessionInner?.user as any)?.id as string | undefined;
    if (!userIdInner) {
      redirect("/auth/login?callbackUrl=/dashboard/cliente/cocinas");
    }

    const kitchenId = String(formData.get("kitchenId") || "").trim();
    const moduleId = String(formData.get("moduleId") || "").trim();
    if (!kitchenId || !moduleId) {
      redirect(`/dashboard/cliente/cocinas/${id}/modulos?error=Datos%20invalidos`);
    }

    const designInner = await (prisma as any).kitchenDesign.findFirst({
      where: { id: kitchenId, userId: userIdInner },
      select: { id: true },
    });
    if (!designInner) {
      redirect(`/dashboard/cliente/cocinas?error=Diseno%20no%20encontrado`);
    }

    await prisma.$transaction(async (tx) => {
      await (tx as any).kitchenModule.deleteMany({
        where: { id: moduleId, kitchenId: designInner.id },
      });

      const total = await (tx as any).kitchenModule.aggregate({
        where: { kitchenId: designInner.id },
        _sum: { priceCalculatedUsd: true },
      });
      const totalPriceUsd = toNumberSafe(total?._sum?.priceCalculatedUsd, 0);
      await (tx as any).kitchenDesign.update({
        where: { id: designInner.id },
        data: {
          totalPriceUsd: totalPriceUsd as any,
          budgetJson: {
            subtotalModules: totalPriceUsd,
            subtotalHardware: 0,
            total: totalPriceUsd,
          },
        },
      });
    });

    redirect(`/dashboard/cliente/cocinas/${id}/modulos`);
  }

  async function saveDesignBudget() {
    "use server";
    const sessionInner = await getServerSession(authOptions);
    const userIdInner = (sessionInner?.user as any)?.id as string | undefined;
    if (!userIdInner) {
      redirect("/auth/login?callbackUrl=/dashboard/cliente/cocinas");
    }

    const designInner = await (prisma as any).kitchenDesign.findFirst({
      where: { id, userId: userIdInner },
    });
    if (!designInner) {
      redirect(`/dashboard/cliente/cocinas?error=Diseno%20no%20encontrado`);
    }

    if (designInner.status === "ARCHIVED") {
      const activeCount = await (prisma as any).kitchenDesign.count({
        where: { userId: userIdInner, status: { in: ["DRAFT", "SAVED"] } },
      });
      if (activeCount >= 2) {
        redirect(`/dashboard/cliente/cocinas?error=Limite%20de%20disenos%20activos%20alcanzado`);
      }
    }

    const total = await (prisma as any).kitchenModule.aggregate({
      where: { kitchenId: designInner.id },
      _sum: { priceCalculatedUsd: true },
    });
    const totalPriceUsd = toNumberSafe(total?._sum?.priceCalculatedUsd, 0);
    await (prisma as any).kitchenDesign.update({
      where: { id: designInner.id },
      data: {
        status: "SAVED",
        totalPriceUsd: totalPriceUsd as any,
        budgetJson: {
          subtotalModules: totalPriceUsd,
          subtotalHardware: 0,
          total: totalPriceUsd,
        },
      },
    });

    redirect(`/dashboard/cliente/cocinas/${id}/modulos`);
  }

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-800">Seleccion de modulos</h1>
        <p className="text-sm text-gray-600">
          Solo se muestran modulos aptos para el diseno de cocinas.
        </p>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 px-3 py-2 rounded text-sm">
          {decodeURIComponent(error)}
        </div>
      )}

      {SECTION_ORDER.map((section) => {
        const items = grouped[section] || [];
        if (!items.length) return null;
        return (
          <section key={section} className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">{section}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((mod) => {
                const basePrice = toNumberSafe(mod.basePriceUsd, 0);
                const categoryKey = String(mod.kitchenCategory || "OTHER");
                const baseDims = `${mod.widthMm ?? "-"} x ${mod.heightMm ?? "-"} x ${mod.depthMm ?? "-"} mm`;
                const rangeDims = `${mod.widthMinMm ?? "-"} - ${mod.widthMaxMm ?? "-"} mm`;
                return (
                  <div key={mod.id} className="border rounded-lg bg-white p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{mod.name}</div>
                        <div className="text-xs text-gray-500">
                          Categoria: {DISPLAY_CATEGORY[categoryKey] || "Otro"}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {basePrice > 0 ? formatMoney(basePrice) : "-"}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div>Medidas base: {baseDims}</div>
                      <div>Ancho ajustable: {rangeDims}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <form action={addModule}>
                        <input type="hidden" name="productId" value={mod.id} />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded bg-gray-900 text-white text-xs font-semibold"
                        >
                          Agregar al diseno
                        </button>
                      </form>
                      {mod.slug && (
                        <Link
                          href={`/productos/${mod.slug}`}
                          className="px-3 py-1.5 rounded border border-gray-300 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                        >
                          Ver detalles tecnicos
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Listado de modulos del proyecto</h2>
          <Link
            href={`/dashboard/cliente/cocinas/${design.id}/medidas`}
            className="text-sm text-blue-600 hover:underline"
          >
            Volver a medidas
          </Link>
        </div>
        {kitchenModules.length === 0 ? (
          <div className="text-sm text-gray-600">Aun no has agregado modulos al proyecto.</div>
        ) : (
          <div className="space-y-3">
            {kitchenModules.map((item) => {
              const categoryKey = String(item.product?.kitchenCategory || "OTHER");
              const rangeLabel =
                item.product?.widthMinMm && item.product?.widthMaxMm
                  ? `${item.product.widthMinMm} - ${item.product.widthMaxMm} mm`
                  : "Sin rango";
              return (
                <div key={item.id} className="border rounded px-3 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.product?.name || "Modulo"}</div>
                      <div className="text-xs text-gray-500">
                        Categoria: {DISPLAY_CATEGORY[categoryKey] || "Otro"}
                      </div>
                      <div className="text-xs text-gray-500">Rango ancho: {rangeLabel}</div>
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {formatMoney(toNumberSafe(item.priceCalculatedUsd, 0))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={updateModule} className="flex items-end gap-2">
                      <input type="hidden" name="kitchenId" value={design.id} />
                      <input type="hidden" name="moduleId" value={item.id} />
                      <label className="text-xs text-gray-600">
                        Ancho (mm)
                        <input
                          type="number"
                          name="widthMm"
                          defaultValue={item.widthMm}
                          min={item.product?.widthMinMm ?? undefined}
                          max={item.product?.widthMaxMm ?? undefined}
                          className="block mt-1 w-28 rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                      </label>
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded bg-gray-900 text-white text-xs font-semibold"
                      >
                        Actualizar
                      </button>
                    </form>
                    <form action={deleteModule}>
                      <input type="hidden" name="kitchenId" value={design.id} />
                      <input type="hidden" name="moduleId" value={item.id} />
                      <button type="submit" className="text-xs text-red-600 underline">
                        Eliminar
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Presupuesto del diseno</h2>
          <span className="text-xs text-gray-500">Total de modulos: {totalModules}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div className="flex items-center justify-between border rounded px-3 py-2">
            <span className="text-gray-600">Subtotal modulos</span>
            <span className="font-semibold text-gray-900">{formatMoney(subtotalModules)}</span>
          </div>
          <div className="flex items-center justify-between border rounded px-3 py-2">
            <span className="text-gray-600">Total general</span>
            <span className="font-semibold text-gray-900">{formatMoney(subtotalModules)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <form action={saveDesignBudget}>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-gray-900 text-white text-xs font-semibold"
            >
              Guardar diseno y presupuesto
            </button>
          </form>
          <a
            href={`/api/kitchen-designs/placeholder-image?kitchenId=${design.id}`}
            className="px-4 py-2 rounded border border-gray-300 text-xs font-semibold text-gray-800 hover:bg-gray-50"
          >
            Descargar imagen del diseno
          </a>
        </div>
      </section>
    </div>
  );
}
