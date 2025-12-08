import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBranches, createBranchAction } from '@/server/actions/branches';

type SearchParams = Promise<{ message?: string; error?: string }>;

export default async function AdminBranchesPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = await getServerSession(authOptions as any);
  if (!session || (session.user as any)?.role !== 'ADMIN') {
    redirect('/auth/login?callbackUrl=/dashboard/admin/sucursales');
  }

  const sp = (await searchParams) || {};
  const message = sp.message || '';
  const error = sp.error || '';

  const branches = await getBranches();

  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Sucursales</h1>
      <p className="text-sm text-gray-600">
        Administra las sucursales fisicas y sus parametros de delivery. Desde aqui podras crear nuevas sedes para
        separar inventario, envios y metricas por ubicacion.
      </p>

      {message && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded bg-white p-4 shadow">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Sucursales registradas</h2>
          <span className="text-sm text-gray-500">{branches.length} en total</span>
        </div>
        {branches.length === 0 ? (
          <p className="text-sm text-gray-500">Aun no hay sucursales registradas. Usa el formulario para crear la primera.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="py-2 pr-2">Nombre</th>
                  <th className="py-2 pr-2">Codigo</th>
                  <th className="py-2 pr-2">Ubicacion</th>
                  <th className="py-2 pr-2">Estado</th>
                  <th className="py-2 pr-2">Tarifas/km</th>
                  <th className="py-2 pr-2">Minimos</th>
                  <th className="py-2 pr-2">Creada</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch: any) => (
                  <tr key={branch.id} className="border-b last:border-b-0 align-top">
                    <td className="py-2 pr-2">
                      <div className="font-semibold text-gray-900 flex items-center gap-2">
                        {branch.name}
                        {!branch.isActive && (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 text-[11px] font-semibold text-amber-700">
                            Inactiva
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 max-w-sm break-words">{branch.address}</div>
                    </td>
                    <td className="py-2 pr-2 text-xs text-gray-700">{branch.code}</td>
                    <td className="py-2 pr-2 text-xs text-gray-700">
                      {branch.city}, {branch.state}
                    </td>
                    <td className="py-2 pr-2 text-xs text-gray-700">
                      Lat: {branch.lat ?? '-'}
                      <br />
                      Lng: {branch.lng ?? '-'}
                    </td>
                    <td className="py-2 pr-2 text-xs text-gray-700">
                      Moto: ${branch.motoRatePerKmUSD ?? '-'}
                      <br />
                      Carro: ${branch.carRatePerKmUSD ?? '-'}
                      <br />
                      Camioneta: ${branch.vanRatePerKmUSD ?? '-'}
                    </td>
                    <td className="py-2 pr-2 text-xs text-gray-700">
                      Moto: ${branch.motoMinFeeUSD ?? '-'}
                      <br />
                      Camioneta: ${branch.vanMinFeeUSD ?? '-'}
                    </td>
                    <td className="py-2 pr-2 text-xs text-gray-500">
                      {branch.createdAt ? new Date(branch.createdAt).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded bg-white p-4 shadow">
        <h2 className="text-lg font-semibold mb-3">Crear nueva sucursal</h2>
        <form action={createBranchAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
              <input
                name="name"
                placeholder="Sucursal Barinas"
                required
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Codigo</label>
              <input
                name="code"
                placeholder="BAR01"
                required
                className="w-full rounded border px-3 py-2 text-sm uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
              <input
                name="state"
                placeholder="Barinas"
                required
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ciudad</label>
              <input
                name="city"
                placeholder="Barinas"
                required
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Direccion</label>
            <textarea
              name="address"
              placeholder="Direccion completa"
              required
              className="w-full rounded border px-3 py-2 text-sm min-h-[60px]"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Latitud (opcional)</label>
              <input
                name="lat"
                type="number"
                step="0.000001"
                placeholder="8.612345"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Longitud (opcional)</label>
              <input
                name="lng"
                type="number"
                step="0.000001"
                placeholder="-70.210987"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tarifa moto (USD/km)</label>
              <input
                name="motoRatePerKmUSD"
                type="number"
                step="0.01"
                placeholder="0.5"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tarifa carro (USD/km)</label>
              <input
                name="carRatePerKmUSD"
                type="number"
                step="0.01"
                placeholder="0.75"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tarifa camioneta (USD/km)</label>
              <input
                name="vanRatePerKmUSD"
                type="number"
                step="0.01"
                placeholder="1.00"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Minimo moto (USD)</label>
              <input
                name="motoMinFeeUSD"
                type="number"
                step="0.01"
                placeholder="4"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Minimo camioneta (USD)</label>
              <input
                name="vanMinFeeUSD"
                type="number"
                step="0.01"
                placeholder="10"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="isActive" defaultChecked />
            Sucursal activa
          </label>

          <div>
            <button
              type="submit"
              className="inline-flex items-center rounded bg-green-600 px-4 py-2 text-white text-sm font-semibold hover:bg-green-700"
            >
              Crear sucursal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
