import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCategoriesFlattened } from '@/server/actions/categories';
import { getSuppliers } from '@/server/actions/procurement';
import { getProducts } from '@/server/actions/products';
import ShowToastFromSearch from '@/components/show-toast-from-search';
import ProductCreateForm from '@/components/admin/product-create-form';

export default async function RootProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions as any);
  const email = String((session?.user as any)?.email || '').toLowerCase();
  const role = String((session?.user as any)?.role || '');
  const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
  const isRoot = role === 'ADMIN' && email === rootEmail;

  if (!isRoot) {
    return (
      <div className="container mx-auto p-4">
        <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">
          No autorizado.
        </div>
      </div>
    );
  }

  const [products, categories, suppliers] = await Promise.all([
    getProducts(),
    getCategoriesFlattened(),
    getSuppliers(),
  ]);
  const flagged = (products as any[]).filter((p: any) => p.rootNoIvaOnly);

  await searchParams; // ensure awaited so ShowToast toma los valores

  return (
    <div className="container mx-auto p-4 space-y-6">
      <ShowToastFromSearch successParam="message" errorParam="error" />
      <div>
        <p className="text-sm uppercase text-rose-500 font-semibold">Solo root</p>
        <h1 className="text-2xl font-bold">Productos marcados para vender sin IVA</h1>
        <p className="text-gray-600 max-w-3xl mt-2">
          Usa este formulario exclusivo para crear productos que solo el usuario root podrá vender sin
          IVA. En el resto del ERP y en el ecommerce estos productos se comportan normal, sin mostrar la
          bandera oculta.
        </p>
      </div>
      <ProductCreateForm
        products={products as any}
        categories={categories as any}
        suppliers={suppliers as any}
        summaryTitle="Crear producto exclusivo del root"
        successRedirect="/dashboard/admin/root/productos?message=Producto%20creado"
        enableRootNoIva
        defaultOpen
      />

      <div className="bg-white border rounded-lg shadow divide-y">
        <div className="p-4">
          <h2 className="text-lg font-semibold">Listado de referencias ocultas</h2>
          <p className="text-sm text-gray-600">
            Estos productos tienen activado <strong>vender sin IVA</strong>. Solo se muestran en este
            panel.
          </p>
        </div>
        <div className="p-4 overflow-x-auto">
          {flagged.length === 0 ? (
            <div className="text-sm text-gray-500">Aún no hay productos con la marca oculta.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="py-2 pr-4">Producto</th>
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Precio USD</th>
                  <th className="py-2 pr-4">Stock</th>
                  <th className="py-2 pr-4">Creado</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.brand}</div>
                    </td>
                    <td className="py-2 pr-4">{p.sku || '-'}</td>
                    <td className="py-2 pr-4">${Number(p.priceUSD || 0).toFixed(2)}</td>
                    <td className="py-2 pr-4">{p.stock}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500">
                      {new Date(p.createdAt as any).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
