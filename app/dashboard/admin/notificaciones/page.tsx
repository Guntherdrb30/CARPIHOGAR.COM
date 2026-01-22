import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getIncompleteProducts } from '@/server/actions/products';

export default async function AdminNotificationsPage() {
  const session = await getServerSession(authOptions as any);
  const role = String((session?.user as any)?.role || '');
  if (!session || (!role || (role !== 'ADMIN' && role !== 'VENDEDOR'))) {
    return <div className="p-4">No autorizado</div>;
  }
  const canEdit = role === 'ADMIN';
  const products = await getIncompleteProducts();

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notificaciones</h1>
        <a href="/dashboard/admin/productos" className="border px-3 py-1 rounded">
          Ver productos
        </a>
      </div>
      <div className="bg-white p-4 rounded-lg shadow space-y-2">
        <div className="text-sm text-gray-700">
          Productos con informacion pendiente: <strong>{products.length}</strong>
        </div>
        <div className="text-xs text-gray-500">
          Se muestran productos sin marca, sin descripcion, sin imagenes o sin categoria.
        </div>
      </div>
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Pendientes</h2>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2">Marca</th>
                <th className="px-3 py-2">Imagenes</th>
                <th className="px-3 py-2">Descripcion</th>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Creado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p: any) => {
                const images = Array.isArray(p.images) ? p.images.length : 0;
                const hasDesc = Boolean(String(p.description || '').trim());
                const hasBrand = Boolean(String(p.brand || '').trim()) && String(p.brand || '').trim() !== 'Sin marca';
                const hasCategory = Boolean(p.categoryId);
                return (
                  <tr key={p.id}>
                    <td className="border px-3 py-2">{p.name}</td>
                    <td className="border px-3 py-2 text-center">{hasBrand ? 'OK' : 'Falta'}</td>
                    <td className="border px-3 py-2 text-center">{images > 0 ? String(images) : 'Falta'}</td>
                    <td className="border px-3 py-2 text-center">{hasDesc ? 'OK' : 'Falta'}</td>
                    <td className="border px-3 py-2 text-center">{hasCategory ? 'OK' : 'Falta'}</td>
                    <td className="border px-3 py-2 text-center">{String(p.status || '')}</td>
                    <td className="border px-3 py-2 text-center">
                      {p.createdAt ? new Date(p.createdAt as any).toLocaleDateString() : '-'}
                    </td>
                    <td className="border px-3 py-2 text-right">
                      <a
                        href={`/dashboard/admin/productos/${p.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {canEdit ? 'Editar' : 'Ver'}
                      </a>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td className="px-3 py-2 text-sm text-gray-500" colSpan={8}>
                    No hay productos pendientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
