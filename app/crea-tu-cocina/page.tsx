import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import CarpihogarModelViewer from '@/components/3d/CarpihogarModelViewer';

export const metadata = {
  title: 'Crea tu cocina | Carpihogar',
};

type SearchParams = {
  productId?: string;
};

function toNumber(value: any) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value?.toNumber === 'function') return value.toNumber();
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getFurnitureTypeLabel(productFamily?: string | null) {
  const family = String(productFamily || '');
  if (family === 'KITCHEN_MODULE') return 'Modulo de cocina';
  if (family === 'PARAMETRIC_FURNITURE') return 'Mueble parametrico';
  if (family) return family;
  return 'Mueble estandar';
}

export default async function CreaTuCocinaPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) || {};
  const productId = String(sp.productId || '').trim();
  const session = await getServerSession(authOptions);
  const isAdmin = String((session?.user as any)?.role || '') === 'ADMIN';

  let product: any = null;
  if (productId) {
    product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });
  }
  if (!product) {
    try {
      product = await prisma.product.findFirst({
        where: { isVisibleInKitchenDesigner: true },
        include: { category: true },
        orderBy: { updatedAt: 'desc' },
      });
    } catch {
      // Fallback if the column is missing in older DBs.
      product = null;
    }
  }
  if (!product) {
    product = await prisma.product.findFirst({
      include: { category: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  const skuValue = product?.sku || product?.code || null;
  const furnitureTypeLabel = getFurnitureTypeLabel(product?.productFamily);

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
            Este es el espacio donde construiremos la experiencia completa para
            disenar cocinas. Aqui viviran el visor 3D, los controles de medidas y
            el panel de materiales.
          </p>
        </header>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Area de diseno</h2>
              <p className="text-xs text-gray-500">
                Visor 3D listo para modelos de mobiliario y cocina.
              </p>
            </div>
            {product && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                Producto activo: {product.name}
              </span>
            )}
          </div>

          <div className="mt-4">
            {product ? (
              <CarpihogarModelViewer
                productId={product.id}
                productName={product.name}
                sku={skuValue}
                category={product.category?.name || null}
                furnitureType={furnitureTypeLabel}
                widthCm={toNumber(product.widthCm)}
                heightCm={toNumber(product.heightCm)}
                depthCm={toNumber(product.depthCm)}
                isAdmin={isAdmin}
              />
            ) : (
              <div className="h-[520px] rounded-lg border border-dashed border-gray-300 bg-gray-100/60 flex items-center justify-center">
                <div className="text-center space-y-2 px-6">
                  <div className="text-sm font-semibold text-gray-800">
                    No hay productos disponibles
                  </div>
                  <p className="text-xs text-gray-500">
                    Agrega un producto o pasa un productId en la URL para cargar el visor 3D.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
