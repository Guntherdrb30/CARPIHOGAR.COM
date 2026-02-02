import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProducts } from "@/server/actions/products";
import ProductCsvUploader from '@/components/admin/product-csv-uploader';
import { getCategoriesFlattened } from "@/server/actions/categories";
import { getSuppliers } from "@/server/actions/procurement";
import { getSettings } from "@/server/actions/settings";
import StockHistory from "@/components/admin/stock-history";
import ProductQuickSearch from "@/components/admin/product-quick-search";
import ProductActionsMenu from "@/components/admin/product-actions-menu";
import ShowToastFromSearch from '@/components/show-toast-from-search';
import ProductCreateForm from '@/components/admin/product-create-form';
import ProductCatalogPrintPanel from '@/components/admin/product-catalog-print-panel';

export default async function AdminProductsPage({ searchParams }: { searchParams?: Promise<{ q?: string; categoria?: string; proveedor?: string; message?: string; error?: string; createKitchen?: string }> }) {
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
  const createKitchen = String((sp as any).createKitchen || '') === '1';

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

      {/* Área imprimible */}
      <ProductCatalogPrintPanel
        products={products as any}
        categories={categories as any}
        settings={settings as any}
      />

      {/* Crear producto */}
      <ProductCreateForm
        products={products as any}
        categories={categories as any}
        suppliers={suppliers as any}
        summaryTitle="Crear Producto"
        defaultOpen={createKitchen}
        successRedirect="/dashboard/admin/productos?message=Producto%20creado"
      />

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
