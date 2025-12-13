import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRootSecretSales, createRootSecretSale } from '@/server/actions/root-sales';
import { getSettings } from '@/server/actions/settings';
import ShowToastFromSearch from '@/components/show-toast-from-search';
import RootSecretSaleForm from '@/components/admin/root-secret-sale-form';
import Link from 'next/link';

export default async function RootSalesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; message?: string; error?: string }>;
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

  const sp = (await searchParams) || {};
  const q = sp.q || '';
  const [sales, settings] = await Promise.all([
    getRootSecretSales(q ? { q } : undefined),
    getSettings(),
  ]);
  const tasa = Number((settings as any)?.tasaVES || 40);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <ShowToastFromSearch successParam="message" errorParam="error" />
      <div>
        <p className="text-sm uppercase text-rose-500 font-semibold">Ventas ocultas</p>
        <h1 className="text-2xl font-bold">Notas de entrega sin IVA (solo root)</h1>
        <p className="text-gray-600 max-w-3xl mt-2">
          Las operaciones registradas aquí no aparecen en el módulo de ventas tradicional. Cada nota solo
          genera entrega, descuenta inventario y queda en este historial privado para el root.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-1">Nueva venta sin IVA</h2>
          <p className="text-sm text-gray-600 mb-4">
            Solo puedes agregar productos marcados previamente con “vender sin IVA”.
          </p>
          <RootSecretSaleForm action={createRootSecretSale} tasaVES={tasa} />
        </div>
        <div className="bg-white rounded-lg border shadow-sm p-4 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Buscar notas existentes</h3>
            <p className="text-sm text-gray-600">
              Filtra por número de nota, cliente o RIF para consultar ventas anteriores.
            </p>
          </div>
          <form className="flex flex-col sm:flex-row gap-2" method="get">
            <input
              name="q"
              placeholder="Nota #, nombre, RIF…"
              defaultValue={q}
              className="border rounded px-2 py-1 flex-1"
            />
            <button className="px-3 py-1 rounded bg-slate-900 text-white">Buscar</button>
            {q && (
              <a href="/dashboard/admin/root/ventas" className="px-3 py-1 rounded border text-gray-700">
                Limpiar
              </a>
            )}
          </form>
          <div className="text-sm text-gray-500">
            Total de notas visibles: <strong>{sales.length}</strong>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg shadow-sm">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Historial de notas de entrega</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Nota</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Total USD</th>
                <th className="px-3 py-2 text-left">Items</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-gray-500" colSpan={6}>
                    No hay notas registradas.
                  </td>
                </tr>
              ) : (
                sales.map((sale: any) => (
                  <tr key={sale.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-semibold">
                      #{String(sale.noteNumber).padStart(6, '0')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-gray-900">{sale.customerName || 'Cliente sin nombre'}</div>
                      {sale.customerTaxId && (
                        <div className="text-xs text-gray-500">{sale.customerTaxId}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">${Number(sale.totalUSD || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {Array.isArray(sale.items) ? sale.items.length : 0}
                    </td>
                    <td className="px-3 py-2">
                      {new Date(sale.createdAt as any).toLocaleString('es-VE')}
                    </td>
                    <td className="px-3 py-2 space-x-3">
                      <Link
                        href={`/dashboard/admin/root/ventas/${sale.id}/print`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Ver / imprimir
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
