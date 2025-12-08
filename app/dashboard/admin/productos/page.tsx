import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProducts, createProduct } from "@/server/actions/products";
import ProductCsvUploader from '@/components/admin/product-csv-uploader';
import { getCategoriesFlattened } from "@/server/actions/categories";
import { getSuppliers } from "@/server/actions/procurement";
import { getSettings } from "@/server/actions/settings";
import StockHistory from "@/components/admin/stock-history";
import ProductMediaManager from "@/components/admin/product-media-manager";
import { redirect } from "next/navigation";
import ProductQuickSearch from "@/components/admin/product-quick-search";
import ProductActionsMenu from "@/components/admin/product-actions-menu";
import { PendingButton } from '@/components/pending-button';
import ShowToastFromSearch from '@/components/show-toast-from-search';
import RelatedProductsPicker from "@/components/admin/related-products-picker";

export default async function AdminProductsPage({ searchParams }: { searchParams?: Promise<{ q?: string; categoria?: string; proveedor?: string; message?: string; error?: string }> }) {
  const session = await getServerSession(authOptions as any);
  const email = String((session?.user as any)?.email || '').toLowerCase();
  const role = String((session?.user as any)?.role || '');
  const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
  const isRoot = role === 'ADMIN' && email === rootEmail;

  const sp = (await searchParams) || ({} as any);
  const q = sp.q || '';
  const categoria = sp.categoria || '';
  const proveedor = (sp as any).proveedor || '';
  const message = (sp as any).message || '';

  const [products, categories, settings, suppliers] = await Promise.all([
    getProducts({ categorySlug: categoria || undefined, q: q || undefined, supplierId: proveedor || undefined }),
    getCategoriesFlattened(),
    getSettings(),
    getSuppliers(),
  ]);
  const lowStock = (settings as any).lowStockThreshold ?? 5;

  return (
    <div className="container mx-auto p-4">
      <ShowToastFromSearch successParam="message" errorParam="error" />
      <h1 className="text-2xl font-bold mb-4">Gestionar Productos</h1>
      {/* Buscador superior */}
      <form className="mb-3 flex gap-2" method="get">
        <input name="q" placeholder="Buscar por nombre, SKU o codigo" defaultValue={q} className="flex-1 border rounded px-2 py-1" />
        <button className="px-3 py-1 rounded bg-brand hover:bg-opacity-90 text-white">Buscar</button>
        {q && (<a href="/dashboard/admin/productos" className="px-3 py-1 rounded border">Limpiar</a>)}
      </form>

      <div className="mb-2 flex items-center gap-3 text-sm">
        <a href="/samples/products_template.csv" className="text-blue-600 underline" download>Descargar plantilla CSV de productos</a>
        <a href="/api/reports/products-csv" className="text-blue-600 underline" target="_blank">Exportar productos (CSV)</a>
      </div>
      <details className="mb-4 p-4 bg-white rounded shadow">
        <summary className="text-lg font-semibold cursor-pointer">Carga masiva (CSV) con previsualizacion</summary>
        <div className="mt-2">
          <p className="text-sm text-gray-600 mb-2">Columnas: <code>name</code>, <code>slug</code>, <code>sku</code>, <code>barcode</code>, <code>brand</code>, <code>priceUSD</code>, <code>priceAllyUSD</code>, <code>stock</code>, <code>categoryId</code>, <code>supplierId</code>, <code>image</code>, <code>images</code>. Puedes omitir precios y solo indicar costo; si no indicas precios, se calculan con los margenes por defecto.</p>
          <ProductCsvUploader />
        </div>
      </details>
      <div className="mb-4">
        <label className="block text-sm text-gray-700 mb-1">Busqueda rapida</label>
        <ProductQuickSearch />
      </div>
      {message && (
        <div className="mb-4 border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">
          {message}
        </div>
      )}

      {/* Filtros */}
      <form className="bg-white p-4 rounded-lg shadow grid grid-cols-1 md:grid-cols-5 gap-3 mb-4" method="get">
        <input name="q" placeholder="Buscar por nombre" defaultValue={q} className="border rounded px-2 py-1" />
        <select name="categoria" defaultValue={categoria} className="border rounded px-2 py-1">
          <option value="">Todas las categorias</option>
          {(categories as any[]).map((c: any) => (
            <option key={c.id} value={c.slug}>{`${'- '.repeat(c.depth || 0)}${c.name}`}</option>
          ))}
        </select>
        <select name="proveedor" defaultValue={proveedor} className="border rounded px-2 py-1">
          <option value="">Todos los proveedores</option>
          {suppliers.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button className="bg-blue-600 text-white px-3 py-1 rounded">Filtrar</button>
        <a href="/dashboard/admin/productos" className="px-3 py-1 rounded border text-gray-700">Limpiar</a>
      </form>

      {/* Crear producto */}
      <details className="form-card">
        <summary className="text-lg font-bold cursor-pointer">Crear Producto</summary>
        <form className="mt-3" action={async (formData) => {
          'use server';
          const images = (formData.getAll('images[]') as string[]).filter(Boolean);
          const mainImageUpload = String(formData.get('mainImage') || '').trim();
          const mainImage = String(formData.get('image') || '').trim() || mainImageUpload;
          if (mainImage) images.unshift(mainImage);
          const limited = images.slice(0, 4);
          const relatedIds = (formData.getAll('relatedIds[]') as string[]).map(String).filter(Boolean);
          const type = String(formData.get('type') || 'SIMPLE') as any;
          const stockUnits = parseInt(String(formData.get('stockUnits') || formData.get('stock') || '0'), 10);
          const stockMinUnits = parseInt(String(formData.get('stockMinUnits') || '0'), 10);
          const allowBackorder = String(formData.get('allowBackorder') || '') === 'on';
          const priceUSD = parseFloat(String(formData.get('priceUSD') || '0'));
          const priceAllyUSD = formData.get('priceAllyUSD') ? parseFloat(String(formData.get('priceAllyUSD'))) : null;
          const priceWholesaleUSD = formData.get('priceWholesaleUSD') ? parseFloat(String(formData.get('priceWholesaleUSD'))) : null;
          const unitsPerPackage = type === 'GROUPED' ? parseInt(String(formData.get('unitsPerPackage') || '0'), 10) || null : null;
          const stockPackages = type === 'GROUPED' ? parseInt(String(formData.get('stockPackages') || '0'), 10) || null : null;
          const soldBy = String(formData.get('soldBy') || 'UNIT') as any;
          const weightKg = formData.get('weightKg') ? parseFloat(String(formData.get('weightKg'))) : null;
          const heightCm = formData.get('heightCm') ? parseFloat(String(formData.get('heightCm'))) : null;
          const widthCm = formData.get('widthCm') ? parseFloat(String(formData.get('widthCm'))) : null;
          const depthCm = formData.get('depthCm') ? parseFloat(String(formData.get('depthCm'))) : null;
          const freightType = String(formData.get('freightType') || '') || null;
          const categoryId = String(formData.get('categoryId') || '' ) || null;
          const supplierId = String(formData.get('supplierId') || '' ) || null;
          const isNew = Boolean(formData.get('isNew'));
          const videoUrl = String((formData.get('videoUrl') as string) || '').trim() || null;
          const showSocialButtons = Boolean(formData.get('showSocialButtons'));
          const deliveryAllowedVehicles = Array.from(
            new Set(
              (formData.getAll('deliveryAllowedVehicles[]') as string[])
                .map((v) => String(v || '').toUpperCase())
                .filter((v) => v === 'MOTO' || v === 'CARRO' || v === 'CAMIONETA')
            )
          );
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
          });
          redirect('/dashboard/admin/productos?message=Producto%20creado');
        }} className="form-grid">
          {/* SECCIÓN 1 – Tipo de producto */}
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

          {/* SECCIÓN 2 – Datos básicos */}
          <input name="name" placeholder="Nombre del producto" className="form-input md:col-span-2" required />
          <input name="slug" placeholder="slug-ejemplo" className="form-input" required />
          <input name="sku" placeholder="Código interno Carpihogar (SKU)" className="form-input" />
          <input name="barcode" placeholder="Código de barras (opcional)" className="form-input" />
          <input name="brand" placeholder="Marca" className="form-input" required />
          <input name="model" placeholder="Modelo" className="form-input" />
          <div className="md:col-span-3">
            <label className="block text-sm text-gray-700 mb-1">Descripción</label>
            <textarea name="description" placeholder="Descripción del producto" className="w-full border rounded px-2 py-1 min-h-[80px]"></textarea>
          </div>

          {/* SECCIÓN 3 – Precios */}
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
            <input name="priceWholesaleUSD" type="number" step="0.01" placeholder="Precio Mayorista" className="form-input" />
          </div>

          {/* SECCIÓN 4 – Inventario */}
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

          {/* Campos para productos agrupados (se pueden dejar vacíos para SIMPLE) */}
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

          {/* SECCIÓN 5 – Envío / Flete */}
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
            <label className="block text-sm text-gray-700 mb-1">Vehiculos permitidos para delivery</label>
            <p className="text-xs text-gray-500 mb-1">Marca los tipos de vehiculo que pueden transportar este producto. Si dejas todos en blanco, se permiten todos.</p>
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
            {(categories as any[]).map((c: any) => (
              <option key={c.id} value={c.id}>{`${'- '.repeat(c.depth || 0)}${c.name}`}</option>
            ))}
          </select>
          <select name="supplierId" className="form-select">
            <option value="">Sin proveedor</option>
            {suppliers.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="md:col-span-3">
            <RelatedProductsPicker products={products as any} name="relatedIds[]" watchCategoryName="categoryId" />
          </div>
          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" name="showSocialButtons" /> Mostrar botones Instagram/TikTok en el producto</label>
            </div>
          </div>
          <ProductMediaManager />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" name="isNew" /> Nuevo</label>
          <div className="md:col-span-3">
            <div className="form-actions">
              <PendingButton className="bg-green-600 text-white px-3 py-1 rounded" pendingText="Creando...">Crear</PendingButton>
            </div>
          </div>
        </form>
      </details>

      {/* Lista compacta con acordeón */}
      <div className="bg-white p-4 rounded-lg shadow mt-4">
        <h2 className="text-lg font-bold mb-2">Todos los Productos</h2>
        <details className="rounded border border-gray-200" open>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">
            Ver productos
          </summary>
          <div className="mt-2">
            <table className="w-full text-sm border-t border-gray-200">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="px-2 py-1 text-left w-[40%]">Producto</th>
                  <th className="px-2 py-1 text-left w-[18%]">Precios (USD)</th>
                  <th className="px-2 py-1 text-left w-[18%]">Stock / Categoría</th>
                  <th className="px-2 py-1 text-left w-[24%]">Proveedor / Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product: any) => (
                  <tr key={product.id} className="border-t align-top">
                    <td className="px-2 py-2">
                      <div className="font-medium text-gray-900 leading-snug">
                        {product.name}
                      </div>
                      <div className="text-xs text-gray-500 break-all">
                        {product.slug}
                      </div>
                      {product.isNew && (
                        <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Nuevo
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs leading-snug">
                      <div>
                        Cliente:{' '}
                        <span className="font-medium">
                          {Number(product.priceUSD).toFixed
                            ? Number(product.priceUSD).toFixed(2)
                            : String(product.priceUSD)}
                        </span>
                      </div>
                      <div className="mt-0.5">
                        Aliado:{' '}
                        <span className="font-medium">
                          {product.priceAllyUSD != null
                            ? Number(product.priceAllyUSD).toFixed
                              ? Number(product.priceAllyUSD).toFixed(2)
                              : String(product.priceAllyUSD)
                            : '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs leading-snug">
                      <div
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          product.stock <= lowStock
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        Stock:&nbsp;{product.stock}
                      </div>
                      <div className="mt-1 text-gray-700">
                        <span className="font-medium">Categoría:</span>{' '}
                        <span className="text-xs">{product.category?.name || '-'}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs leading-snug">
                      <div className="text-gray-700 mb-1">
                        <span className="font-medium">Proveedor:</span>{' '}
                        <span className="text-xs">{product.supplier?.name || '-'}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <div>
                          <ProductActionsMenu
                            product={product}
                            lowStock={lowStock}
                            isRoot={isRoot}
                          />
                        </div>
                        <div>
                          <StockHistory productId={product.id} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}
