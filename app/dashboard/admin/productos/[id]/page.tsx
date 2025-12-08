import { getCategoriesFlattened } from "@/server/actions/categories";
import { getSuppliers } from "@/server/actions/procurement";
import { getProductById, updateProductFull, getRelatedIds, getProducts } from "@/server/actions/products";
import ProductMediaManager from "@/components/admin/product-media-manager";
import RelatedProductsPicker from "@/components/admin/related-products-picker";

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const { id } = params;
  let product: any = null;
  let categories: any[] = [];
  let suppliers: any[] = [];
  let allProducts: any[] = [];
  let relatedIds: string[] = [];
  try {
    const r = await Promise.all([
      getProductById(id),
      getCategoriesFlattened(),
      getSuppliers(),
      getProducts(),
      getRelatedIds(id),
    ]);
    product = r[0];
    categories = Array.isArray(r[1]) ? r[1] : [];
    suppliers = Array.isArray(r[2]) ? r[2] : [];
    allProducts = Array.isArray(r[3]) ? r[3] : [];
    relatedIds = Array.isArray(r[4]) ? r[4] : [];
  } catch {}

  if (!product) {
    return <div className="container mx-auto p-4">Producto no encontrado</div>;
  }
  const deliveryAllowed: string[] = Array.isArray((product as any).deliveryAllowedVehicles)
    ? (product as any).deliveryAllowedVehicles
    : [];
  const hasRestrictions = deliveryAllowed.length > 0;
  const isVehicleAllowed = (type: string) => {
    if (!hasRestrictions) return false;
    return deliveryAllowed.includes(type);
  };

  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Editar Producto</h1>
      <form action={updateProductFull} className="form-card form-grid">
        <input type="hidden" name="id" value={product.id} />

        {/* SECCIÓN 1 – Tipo de producto */}
        <div className="md:col-span-3 border-b pb-2 mb-2">
          <h2 className="font-semibold text-sm mb-2">Tipo de producto</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="type" value="SIMPLE" defaultChecked={product.type === 'SIMPLE'} /> Producto simple
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="type" value="GROUPED" defaultChecked={product.type === 'GROUPED'} /> Producto agrupado (caja/paquete)
            </label>
          </div>
        </div>

        {/* SECCIÓN 2 – Datos básicos */}
        <input
          name="name"
          defaultValue={product.name}
          placeholder="Nombre del producto"
          className="border rounded px-2 py-1 md:col-span-2"
          required
        />
        <input
          name="slug"
          defaultValue={product.slug}
          placeholder="slug-ejemplo"
          className="border rounded px-2 py-1"
          required
        />
        <input
          name="brand"
          defaultValue={(product as any).brand || ''}
          placeholder="Marca"
          className="border rounded px-2 py-1"
          required
        />
        <input
          name="model"
          defaultValue={(product as any).model || ''}
          placeholder="Modelo"
          className="border rounded px-2 py-1"
        />
        <input
          name="sku"
          defaultValue={product.sku || ''}
          placeholder="Código interno Carpihogar (SKU)"
          className="border rounded px-2 py-1"
        />
        <input
          name="barcode"
          defaultValue={product.barcode || ''}
          placeholder="Código de barras (opcional)"
          className="border rounded px-2 py-1"
        />
        <input
          name="supplierCode"
          defaultValue={(product as any).supplierCode || ''}
          placeholder="Código del proveedor"
          className="border rounded px-2 py-1"
        />

        <select
          name="categoryId"
          defaultValue={product.categoryId || ''}
          className="border rounded px-2 py-1"
        >
          <option value="">Sin categoría</option>
          {(categories as any[]).map((c: any) => (
            <option key={c.id} value={c.id}>{`${'- '.repeat(c.depth || 0)}${c.name}`}</option>
          ))}
        </select>
        <select
          name="supplierId"
          defaultValue={(product as any).supplierId || ''}
          className="border rounded px-2 py-1"
        >
          <option value="">Sin proveedor</option>
          {suppliers?.map?.((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={(product as any).status || 'ACTIVE'}
          className="border rounded px-2 py-1"
        >
          <option value="ACTIVE">Activo</option>
          <option value="INACTIVE">Inactivo</option>
          <option value="REVIEW">En revisión</option>
          <option value="WHOLESALE_ONLY">Solo mayorista</option>
          <option value="CLEARANCE">Remate</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="isNew" defaultChecked={product.isNew} /> Nuevo
        </label>

        <div className="md:col-span-3">
          <label className="block text-sm text-gray-700 mb-1">Descripción</label>
          <textarea
            name="description"
            defaultValue={product.description || ''}
            placeholder="Descripción"
            className="border rounded px-2 py-1 w-full min-h-[80px]"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-sm text-gray-700 mb-1">Garantía</label>
          <textarea
            name="guarantee"
            defaultValue={(product as any).guarantee || ''}
            placeholder="Garantía"
            className="border rounded px-2 py-1 w-full min-h-[60px]"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-sm text-gray-700 mb-1">Palabras clave (separadas por coma)</label>
          <input
            name="keywords"
            defaultValue={
              Array.isArray((product as any).keywords)
                ? (product as any).keywords.join(', ')
                : ''
            }
            placeholder="mueble baño, peinadora, bisagras, ..."
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        {/* SECCIÓN 3 – Precios */}
        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio Cliente (USD)</label>
          <input
            name="priceUSD"
            type="number"
            step="0.01"
            defaultValue={Number(product.priceUSD)}
            placeholder="Precio Cliente"
            className="border rounded px-2 py-1"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio Aliado (USD)</label>
          <input
            name="priceAllyUSD"
            type="number"
            step="0.01"
            defaultValue={product.priceAllyUSD ? Number(product.priceAllyUSD) : undefined}
            placeholder="Precio Aliado (opcional)"
            className="border rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio Mayorista (USD)</label>
          <input
            name="priceWholesaleUSD"
            type="number"
            step="0.01"
            defaultValue={(product as any).priceWholesaleUSD ? Number((product as any).priceWholesaleUSD) : undefined}
            placeholder="Precio Mayorista (opcional)"
            className="border rounded px-2 py-1"
          />
        </div>

        {/* SECCIÓN 4 – Inventario */}
        <div>
          <label className="block text-sm text-gray-700 mb-1">Stock en unidades</label>
          <input
            name="stockUnits"
            type="number"
            min={0}
            defaultValue={(product as any).stockUnits ?? product.stock}
            placeholder="Stock unidades"
            className="border rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Stock mínimo</label>
          <input
            name="stockMinUnits"
            type="number"
            min={0}
            defaultValue={(product as any).stockMinUnits ?? 0}
            placeholder="Stock mínimo"
            className="border rounded px-2 py-1"
          />
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="allowBackorder"
              defaultChecked={Boolean((product as any).allowBackorder)}
            />{" "}
            Permitir venta por pedido (solo ERP)
          </label>
        </div>

        {/* Configuración agrupados */}
        <div>
          <label className="block text-sm text-gray-700 mb-1">Unidades por paquete/caja</label>
          <input
            name="unitsPerPackage"
            type="number"
            min={0}
            defaultValue={(product as any).unitsPerPackage ?? ''}
            placeholder="Unidades por paquete"
            className="border rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Stock en paquetes/cajas</label>
          <input
            name="stockPackages"
            type="number"
            min={0}
            defaultValue={(product as any).stockPackages ?? ''}
            placeholder="Stock paquetes"
            className="border rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Forma de venta</label>
          <select
            name="soldBy"
            defaultValue={(product as any).soldBy || 'UNIT'}
            className="border rounded px-2 py-1"
          >
            <option value="UNIT">Solo unidad</option>
            <option value="PACKAGE">Solo caja/paquete</option>
            <option value="BOTH">Ambas</option>
          </select>
        </div>

        {/* SECCIÓN 5 – Envío / Flete */}
        <div>
          <label className="block text-sm text-gray-700 mb-1">Peso (kg)</label>
          <input
            name="weightKg"
            type="number"
            step="0.001"
            min={0}
            defaultValue={(product as any).weightKg ?? ''}
            placeholder="Peso kg"
            className="border rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Alto (cm)</label>
          <input
            name="heightCm"
            type="number"
            step="0.01"
            min={0}
            defaultValue={(product as any).heightCm ?? ''}
            placeholder="Alto"
            className="border rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Ancho (cm)</label>
          <input
            name="widthCm"
            type="number"
            step="0.01"
            min={0}
            defaultValue={(product as any).widthCm ?? ''}
            placeholder="Ancho"
            className="border rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Profundidad (cm)</label>
          <input
            name="depthCm"
            type="number"
            step="0.01"
            min={0}
            defaultValue={(product as any).depthCm ?? ''}
            placeholder="Profundidad"
            className="border rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Tipo de flete</label>
          <select
            name="freightType"
            defaultValue={(product as any).freightType || 'normal'}
            className="border rounded px-2 py-1"
          >
            <option value="normal">Normal</option>
            <option value="fragil">Fragil</option>
            <option value="voluminoso">Voluminoso</option>
            <option value="sobrepeso">Sobrepeso</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm text-gray-700 mb-1">Vehiculos permitidos para delivery</label>
          <p className="text-xs text-gray-500 mb-1">Marca los vehiculos que pueden transportar el producto. Si dejas todo en blanco, se permiten todos.</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="deliveryAllowedVehicles[]"
                value="MOTO"
                defaultChecked={isVehicleAllowed('MOTO')}
              />
              Moto
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="deliveryAllowedVehicles[]"
                value="CARRO"
                defaultChecked={isVehicleAllowed('CARRO')}
              />
              Carro
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="deliveryAllowedVehicles[]"
                value="CAMIONETA"
                defaultChecked={isVehicleAllowed('CAMIONETA')}
              />
              Camioneta
            </label>
          </div>
        </div>

        {/* Media / relaciones */}
        <div className="md:col-span-3">
          <RelatedProductsPicker
            products={allProducts as any}
            name="relatedIds[]"
            defaultValue={relatedIds as any}
            watchCategoryName="categoryId"
          />
        </div>
        <ProductMediaManager
          defaultImages={product.images as any as string[]}
          defaultVideoUrl={(product as any).videoUrl || ''}
        />

        <div className="md:col-span-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="showSocialButtons"
              defaultChecked={Boolean((product as any).showSocialButtons)}
            />{" "}
            Mostrar botones Instagram/TikTok en el producto
          </label>
        </div>

        <div className="md:col-span-3 flex gap-2">
          <button className="bg-green-600 text-white px-3 py-1 rounded">Guardar cambios</button>
          <a href="/dashboard/admin/productos" className="px-3 py-1 rounded border">
            Volver
          </a>
        </div>
      </form>
    </div>
  );
}
