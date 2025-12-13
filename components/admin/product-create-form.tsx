import { createProduct } from '@/server/actions/products';
import { redirect } from 'next/navigation';
import { PendingButton } from '@/components/pending-button';
import ProductMediaManager from '@/components/admin/product-media-manager';
import RelatedProductsPicker from '@/components/admin/related-products-picker';

type ProductCreateFormProps = {
  products: any[];
  categories: any[];
  suppliers: any[];
  summaryTitle?: string;
  successRedirect?: string;
  enableRootNoIva?: boolean;
  defaultOpen?: boolean;
};

export default function ProductCreateForm({
  products,
  categories,
  suppliers,
  summaryTitle = 'Crear Producto',
  successRedirect = '/dashboard/admin/productos?message=Producto%20creado',
  enableRootNoIva = false,
  defaultOpen = false,
}: ProductCreateFormProps) {
  return (
    <details className="form-card" open={defaultOpen}>
      <summary className="text-lg font-bold cursor-pointer">{summaryTitle}</summary>
      <form
        className="mt-3"
        action={async (formData) => {
          'use server';
          const images = (formData.getAll('images[]') as string[]).filter(Boolean);
          const mainImageUpload = String(formData.get('mainImage') || '').trim();
          const mainImage = String(formData.get('image') || '').trim() || mainImageUpload;
          if (mainImage) images.unshift(mainImage);
          const limited = images.slice(0, 4);
          const relatedIds = (formData.getAll('relatedIds[]') as string[]).map(String).filter(Boolean);
          const type = String(formData.get('type') || 'SIMPLE') as any;
          const stockUnits = parseInt(
            String(formData.get('stockUnits') || formData.get('stock') || '0'),
            10,
          );
          const stockMinUnits = parseInt(String(formData.get('stockMinUnits') || '0'), 10);
          const allowBackorder = String(formData.get('allowBackorder') || '') === 'on';
          const priceUSD = parseFloat(String(formData.get('priceUSD') || '0'));
          const priceAllyUSD = formData.get('priceAllyUSD')
            ? parseFloat(String(formData.get('priceAllyUSD')))
            : null;
          const priceWholesaleUSD = formData.get('priceWholesaleUSD')
            ? parseFloat(String(formData.get('priceWholesaleUSD')))
            : null;
          const unitsPerPackage =
            type === 'GROUPED'
              ? parseInt(String(formData.get('unitsPerPackage') || '0'), 10) || null
              : null;
          const stockPackages =
            type === 'GROUPED'
              ? parseInt(String(formData.get('stockPackages') || '0'), 10) || null
              : null;
          const soldBy = String(formData.get('soldBy') || 'UNIT') as any;
          const weightKg = formData.get('weightKg') ? parseFloat(String(formData.get('weightKg'))) : null;
          const heightCm = formData.get('heightCm') ? parseFloat(String(formData.get('heightCm'))) : null;
          const widthCm = formData.get('widthCm') ? parseFloat(String(formData.get('widthCm'))) : null;
          const depthCm = formData.get('depthCm') ? parseFloat(String(formData.get('depthCm'))) : null;
          const freightType = String(formData.get('freightType') || '') || null;
          const categoryId = String(formData.get('categoryId') || '') || null;
          const supplierId = String(formData.get('supplierId') || '') || null;
          const isNew = Boolean(formData.get('isNew'));
          const videoUrl = String((formData.get('videoUrl') as string) || '').trim() || null;
          const showSocialButtons = Boolean(formData.get('showSocialButtons'));
          const deliveryAllowedVehicles = Array.from(
            new Set(
              (formData.getAll('deliveryAllowedVehicles[]') as string[])
                .map((v) => String(v || '').toUpperCase())
                .filter((v) => v === 'MOTO' || v === 'CARRO' || v === 'CAMIONETA'),
            ),
          );
          const rootNoIvaOnly = enableRootNoIva && String(formData.get('rootNoIvaOnly') || '') === 'on';
          await createProduct({
            name: String(formData.get('name') || ''),
            slug: String(formData.get('slug') || ''),
            brand: String(formData.get('brand') || ''),
            description: String(formData.get('description') || ''),
            images: limited,
            sku: String(formData.get('sku') || '') || null,
            barcode: String(formData.get('barcode') || ''),
            priceUSD,
            priceAllyUSD,
            priceWholesaleUSD,
            stock: stockUnits,
            stockUnits,
            stockMinUnits,
            allowBackorder,
            type,
            unitsPerPackage,
            stockPackages,
            soldBy,
            weightKg,
            heightCm,
            widthCm,
            depthCm,
            freightType,
            categoryId,
            supplierId,
            isNew,
            videoUrl,
            showSocialButtons,
            relatedIds,
            deliveryAllowedVehicles,
            rootNoIvaOnly,
          });
          redirect(successRedirect);
        }}
        className="form-grid"
      >
        <div className="md:col-span-3 border-b pb-2 mb-2">
          <h3 className="font-semibold text-sm mb-2">Tipo de producto</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="type" value="SIMPLE" defaultChecked /> Producto simple
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="type" value="GROUPED" /> Producto agrupado (caja/paquete)
            </label>
          </div>
        </div>

        <input name="name" placeholder="Nombre del producto" className="form-input md:col-span-2" required />
        <input name="slug" placeholder="slug-ejemplo" className="form-input" required />
        <input name="sku" placeholder="Código interno Carpihogar (SKU)" className="form-input" />
        <input name="barcode" placeholder="Código de barras (opcional)" className="form-input" />
        <input name="brand" placeholder="Marca" className="form-input" required />
        <input name="model" placeholder="Modelo" className="form-input" />
        <div className="md:col-span-3">
          <label className="block text-sm text-gray-700 mb-1">Descripción</label>
          <textarea
            name="description"
            placeholder="Descripción del producto"
            className="w-full border rounded px-2 py-1 min-h-[80px]"
          ></textarea>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio Cliente (USD)</label>
          <input name="priceUSD" type="number" step="0.01" placeholder="Precio Cliente" className="form-input" required />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio Aliado (USD)</label>
          <input name="priceAllyUSD" type="number" step="0.01" placeholder="Precio Aliado" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio Mayorista (USD)</label>
          <input
            name="priceWholesaleUSD"
            type="number"
            step="0.01"
            placeholder="Precio Mayorista"
            className="form-input"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Stock en unidades</label>
          <input name="stockUnits" type="number" min="0" placeholder="Stock unidades" className="form-input" required />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Stock mínimo</label>
          <input name="stockMinUnits" type="number" min="0" placeholder="Stock mínimo" className="form-input" />
        </div>
        <div className="md:col-span-1 flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="allowBackorder" /> Permitir venta por pedido (solo ERP)
          </label>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Unidades por paquete/caja</label>
          <input name="unitsPerPackage" type="number" min="0" placeholder="Unidades por paquete" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Stock en paquetes/cajas</label>
          <input name="stockPackages" type="number" min="0" placeholder="Stock paquetes" className="form-input" />
        </div>
        <div className="md:col-span-1">
          <label className="block text-sm text-gray-700 mb-1">Forma de venta</label>
          <select name="soldBy" className="form-select">
            <option value="UNIT">Solo unidad</option>
            <option value="PACKAGE">Solo caja/paquete</option>
            <option value="BOTH">Ambas</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Peso (kg)</label>
          <input name="weightKg" type="number" step="0.001" min="0" placeholder="Peso kg" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Alto (cm)</label>
          <input name="heightCm" type="number" step="0.01" min="0" placeholder="Alto" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Ancho (cm)</label>
          <input name="widthCm" type="number" step="0.01" min="0" placeholder="Ancho" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Profundidad (cm)</label>
          <input name="depthCm" type="number" step="0.01" min="0" placeholder="Profundidad" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Tipo de flete</label>
          <select name="freightType" className="form-select">
            <option value="">Seleccionar tipo de flete</option>
            <option value="normal">Normal</option>
            <option value="fragil">Fragil</option>
            <option value="voluminoso">Voluminoso</option>
            <option value="sobrepeso">Sobrepeso</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm text-gray-700 mb-1">Vehículos permitidos para delivery</label>
          <p className="text-xs text-gray-500 mb-1">
            Marca los tipos de vehículo que pueden transportar este producto. Si dejas todos en blanco, se
            permiten todos.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="deliveryAllowedVehicles[]" value="MOTO" /> Moto
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="deliveryAllowedVehicles[]" value="CARRO" /> Carro
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="deliveryAllowedVehicles[]" value="CAMIONETA" /> Camioneta
            </label>
          </div>
        </div>
        <input name="videoUrl" placeholder="URL de video (opcional)" className="form-input" />
        <select name="categoryId" className="form-select">
          <option value="">Sin categoria</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>{`${'- '.repeat(c.depth || 0)}${c.name}`}</option>
          ))}
        </select>
        <select name="supplierId" className="form-select">
          <option value="">Sin proveedor</option>
          {suppliers.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="md:col-span-3">
          <RelatedProductsPicker products={products as any} name="relatedIds[]" watchCategoryName="categoryId" />
        </div>
        <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="showSocialButtons" /> Mostrar botones Instagram/TikTok en el producto
            </label>
          </div>
          {enableRootNoIva && (
            <div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 text-red-700 font-semibold">
                <input type="checkbox" name="rootNoIvaOnly" /> Vender sin IVA (solo desde panel root)
              </label>
            </div>
          )}
        </div>
        <ProductMediaManager />
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="isNew" /> Nuevo
        </label>
        <div className="md:col-span-3">
          <div className="form-actions">
            <PendingButton className="bg-green-600 text-white px-3 py-1 rounded" pendingText="Creando...">
              Crear
            </PendingButton>
          </div>
        </div>
      </form>
    </details>
  );
}
