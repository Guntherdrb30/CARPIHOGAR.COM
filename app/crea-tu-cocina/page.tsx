import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import KitchenStudio from "@/components/kitchen/KitchenStudio";

export const metadata = {
  title: "Crea tu cocina | Carpihogar",
};

const toNumber = (value: any) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value?.toNumber === "function") return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export default async function CreaTuCocinaPage() {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const email = String((session?.user as any)?.email || "").toLowerCase();
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  const isRoot = role === "ADMIN" && email === rootEmail;
  const isAuthenticated = Boolean((session?.user as any)?.id);

  const modules = await prisma.product.findMany({
    where: {
      productFamily: "KITCHEN_MODULE",
      usableInKitchenDesigner: true,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      code: true,
      kitchenCategory: true,
      widthMm: true,
      heightMm: true,
      depthMm: true,
      widthMinMm: true,
      widthMaxMm: true,
      kitchenPriceLowUsd: true,
      kitchenPriceMidUsd: true,
      kitchenPriceHighUsd: true,
      basePriceUsd: true,
      priceUSD: true,
    },
  });

  const normalizedModules = modules.map((item) => ({
    ...item,
    widthMm: toNumber(item.widthMm),
    heightMm: toNumber(item.heightMm),
    depthMm: toNumber(item.depthMm),
    widthMinMm: toNumber(item.widthMinMm),
    widthMaxMm: toNumber(item.widthMaxMm),
    kitchenPriceLowUsd: toNumber((item as any).kitchenPriceLowUsd),
    kitchenPriceMidUsd: toNumber((item as any).kitchenPriceMidUsd),
    kitchenPriceHighUsd: toNumber((item as any).kitchenPriceHighUsd),
    basePriceUsd: toNumber((item as any).basePriceUsd),
    priceUSD: toNumber((item as any).priceUSD),
  }));

  return (
    <div className="bg-gray-50 py-10">
      <div className="container mx-auto px-4 space-y-6">
        <header className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.25em] text-brand uppercase">
            Kitchen Studio
          </p>
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900">
            Crea tu cocina
          </h1>
          <p className="text-sm text-gray-600 max-w-2xl">
            Define tu layout, carga medidas y arma tu presupuesto con modulos 3D.
          </p>
        </header>

        <KitchenStudio
          modules={normalizedModules}
          isAuthenticated={isAuthenticated}
          isRoot={isRoot}
        />
      </div>
    </div>
  );
}
