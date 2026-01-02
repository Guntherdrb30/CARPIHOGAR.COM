import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

const LAYOUT_OPTIONS = [
  { value: "LINEAL", label: "Lineal", description: "Una sola pared de trabajo." },
  { value: "L_SHAPE", label: "En L", description: "Dos paredes en forma de L." },
  { value: "DOUBLE_LINE", label: "Lineal doble", description: "Frente a frente." },
  { value: "LINEAL_WITH_ISLAND", label: "Lineal con isla", description: "Una pared + isla central." },
  { value: "L_WITH_ISLAND", label: "En L con isla", description: "L principal + isla." },
  { value: "L_WITH_PENINSULA", label: "En L con peninsula", description: "L principal + peninsula." },
  { value: "CUSTOM_SPACE", label: "Crear mi propio espacio", description: "Diseno libre del espacio." },
];

const LAYOUT_LABELS: Record<string, string> = {
  LINEAL: "Lineal",
  L_SHAPE: "En L",
  DOUBLE_LINE: "Lineal doble",
  LINEAL_WITH_ISLAND: "Lineal con isla",
  L_WITH_ISLAND: "En L con isla",
  L_WITH_PENINSULA: "En L con peninsula",
  CUSTOM_SPACE: "Espacio libre",
};

export default async function MisDisenosCocinaPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return <div className="p-4">Debes iniciar sesion para ver tus disenos de cocina.</div>;
  }

  const sp = (await searchParams) || {};
  const error = String((sp as any).error || "");

  const designs = await (prisma as any).kitchenDesign.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  const latestDesign = designs[0] || null;

  async function deleteDesign(formData: FormData) {
    "use server";
    const sessionInner = await getServerSession(authOptions);
    const userIdInner = (sessionInner?.user as any)?.id as string | undefined;
    if (!userIdInner) {
      redirect("/auth/login?callbackUrl=/dashboard/cliente/cocinas");
    }
    const designId = String(formData.get("designId") || "").trim();
    if (!designId) {
      redirect("/dashboard/cliente/cocinas?error=Diseno%20invalido");
    }
    await (prisma as any).kitchenDesign.deleteMany({
      where: { id: designId, userId: userIdInner },
    });
    redirect("/dashboard/cliente/cocinas");
  }

  async function duplicateDesign(formData: FormData) {
    "use server";
    const sessionInner = await getServerSession(authOptions);
    const userIdInner = (sessionInner?.user as any)?.id as string | undefined;
    if (!userIdInner) {
      redirect("/auth/login?callbackUrl=/dashboard/cliente/cocinas");
    }
    const designId = String(formData.get("designId") || "").trim();
    if (!designId) {
      redirect("/dashboard/cliente/cocinas?error=Diseno%20invalido");
    }

    const activeCount = await (prisma as any).kitchenDesign.count({
      where: { userId: userIdInner, status: { in: ["DRAFT", "SAVED"] } },
    });
    if (activeCount >= 5) {
      redirect("/dashboard/cliente/cocinas?error=Limite%20de%20disenos%20activos%20alcanzado");
    }

    const original = await (prisma as any).kitchenDesign.findFirst({
      where: { id: designId, userId: userIdInner },
    });
    if (!original) {
      redirect("/dashboard/cliente/cocinas?error=Diseno%20no%20encontrado");
    }

    const copy = await (prisma as any).kitchenDesign.create({
      data: {
        userId: userIdInner,
        name: `${original.name} (copia)`,
        layoutType: original.layoutType,
        status: "DRAFT",
        totalPriceUsd: original.totalPriceUsd,
        planJson: original.planJson,
        modulesJson: original.modulesJson,
        budgetJson: original.budgetJson,
      },
    });

    const spaces = await (prisma as any).kitchenSpace.findMany({
      where: { kitchenId: original.id },
    });
    if (spaces.length) {
      await (prisma as any).kitchenSpace.createMany({
        data: spaces.map((s: any) => ({
          kitchenId: copy.id,
          wallName: s.wallName,
          widthMm: s.widthMm,
          heightMm: s.heightMm,
        })),
      });
    }

    const modules = await (prisma as any).kitchenModule.findMany({
      where: { kitchenId: original.id },
    });
    if (modules.length) {
      await (prisma as any).kitchenModule.createMany({
        data: modules.map((m: any) => ({
          kitchenId: copy.id,
          productId: m.productId,
          positionX: m.positionX,
          positionY: m.positionY,
          widthMm: m.widthMm,
          depthMm: m.depthMm,
          lockedHeight: m.lockedHeight,
          priceCalculatedUsd: m.priceCalculatedUsd,
        })),
      });
    }

    redirect(`/dashboard/cliente/cocinas/${copy.id}/medidas`);
  }

  async function createKitchenDesign(formData: FormData) {
    "use server";
    const sessionInner = await getServerSession(authOptions);
    const userIdInner = (sessionInner?.user as any)?.id as string | undefined;
    if (!userIdInner) {
      redirect("/auth/login?callbackUrl=/dashboard/cliente/cocinas");
    }

    const layoutType = String(formData.get("layoutType") || "").trim().toUpperCase();
    if (!layoutType || !(layoutType in LAYOUT_LABELS)) {
      redirect("/dashboard/cliente/cocinas?error=Tipo%20de%20cocina%20invalido");
    }

    const activeCount = await (prisma as any).kitchenDesign.count({
      where: { userId: userIdInner, status: { in: ["DRAFT", "SAVED"] } },
    });
    if (activeCount >= 5) {
      redirect("/dashboard/cliente/cocinas?error=Limite%20de%20disenos%20activos%20alcanzado");
    }

    const now = new Date();
    const dateTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    const name = `Cocina ${LAYOUT_LABELS[layoutType]} ${dateTag}`;

    const record = await (prisma as any).kitchenDesign.create({
      data: {
        userId: userIdInner,
        name,
        layoutType,
        status: "DRAFT",
        totalPriceUsd: 0,
      },
    });

    redirect(`/dashboard/cliente/cocinas/${record.id}/medidas`);
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-800">Mis Disenos de Cocina</h1>
        <p className="text-xs text-gray-500">
          Puedes guardar hasta 5 disenos activos. El resto quedara archivado.
        </p>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 px-3 py-2 rounded text-sm">
          {decodeURIComponent(error)}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          Selecciona el tipo de cocina que deseas crear
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {LAYOUT_OPTIONS.map((option) => (
            <form key={option.value} action={createKitchenDesign} className="border rounded-lg p-3 hover:border-gray-400">
              <input type="hidden" name="layoutType" value={option.value} />
              <button type="submit" className="w-full text-left">
                <div className="text-sm font-semibold text-gray-900">{option.label}</div>
                <div className="text-xs text-gray-500 mt-1">{option.description}</div>
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Ultimo diseno guardado</h2>
        {!latestDesign ? (
          <div className="text-sm text-gray-600">
            Aun no tienes disenos de cocina guardados. Selecciona un tipo para comenzar.
          </div>
        ) : (
          <div className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">{latestDesign.name}</div>
              <div className="text-xs text-gray-500">
                {String(latestDesign.layoutType).replace(/_/g, " ")} - {String(latestDesign.status)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center justify-end">
              <Link
                href={`/dashboard/cliente/cocinas/${latestDesign.id}/medidas`}
                className="text-sm text-blue-600 hover:underline"
              >
                Continuar
              </Link>
              <form action={duplicateDesign}>
                <input type="hidden" name="designId" value={latestDesign.id} />
                <button type="submit" className="text-xs text-gray-700 underline">
                  Duplicar
                </button>
              </form>
              <form action={deleteDesign}>
                <input type="hidden" name="designId" value={latestDesign.id} />
                <button type="submit" className="text-xs text-red-600 underline">
                  Eliminar
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Ultimos 5 presupuestos</h2>
        {designs.length === 0 ? (
          <div className="text-sm text-gray-600">Aun no tienes presupuestos guardados.</div>
        ) : (
          <div className="space-y-2">
            {designs.map((d: any) => {
              const totalFromBudget = Number((d as any)?.budgetJson?.total ?? 0);
              const totalFromDesign = Number(d.totalPriceUsd ?? 0);
              const total = totalFromBudget > 0 ? totalFromBudget : totalFromDesign;
              return (
                <div key={d.id} className="border rounded-lg px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{d.name}</div>
                    <div className="text-xs text-gray-500">
                      {String(d.layoutType).replace(/_/g, " ")} - {String(d.status)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-semibold text-gray-900">${total.toFixed(2)}</div>
                    <Link
                      href={`/dashboard/cliente/cocinas/${d.id}/modulos`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
