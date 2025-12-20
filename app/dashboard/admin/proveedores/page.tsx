import { getSuppliers, createSupplier, updateSupplier } from '@/server/actions/procurement';
import { PendingButton } from '@/components/pending-button';
import ShowToastFromSearch from '@/components/show-toast-from-search';
import MainImageUploader from '@/components/admin/main-image-uploader';

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  const [suppliers, sp] = await Promise.all([
    getSuppliers(),
    (async () => (await searchParams) || {})(),
  ]);
  const error = (sp as any).error;
  const message = (sp as any).message;

  return (
    <div className="container mx-auto p-4 space-y-4">
      <ShowToastFromSearch successParam="message" errorParam="error" />
      <h1 className="text-2xl font-bold">Proveedores</h1>
      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">
          {error}
        </div>
      )}
      {message && (
        <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">
          {message}
        </div>
      )}

      {/* Crear proveedor */}
      <div className="form-card">
        <h2 className="text-lg font-bold">Crear proveedor</h2>
        <form action={createSupplier} className="form-grid">
          <div>
            <label className="form-label" htmlFor="name">
              Nombre del proveedor
            </label>
            <input
              id="name"
              name="name"
              placeholder="Carpintería Ejemplo C.A."
              className="form-input"
              required
            />
          </div>

          <div>
            <label className="form-label" htmlFor="taxId">
              RIF / NIT
            </label>
            <input
              id="taxId"
              name="taxId"
              placeholder="J-00000000-0"
              className="form-input"
            />
          </div>

          <div>
            <label className="form-label" htmlFor="email">
              Email (opcional)
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="facturacion@proveedor.com"
              className="form-input"
            />
          </div>

          <div>
            <label className="form-label" htmlFor="phone">
              Teléfono empresa (opcional)
            </label>
            <input
              id="phone"
              name="phone"
              placeholder="+58 000-0000000"
              className="form-input"
            />
          </div>

          <div>
            <label className="form-label" htmlFor="contactName">
              Persona contacto
            </label>
            <input
              id="contactName"
              name="contactName"
              placeholder="Nombre y apellido"
              className="form-input"
            />
          </div>

          <div>
            <label className="form-label" htmlFor="contactPhone">
              Teléfono contacto
            </label>
            <input
              id="contactPhone"
              name="contactPhone"
              placeholder="+58 000-0000000"
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label" htmlFor="chargeCurrency">
              Moneda de cobro
            </label>
            <select id="chargeCurrency" name="chargeCurrency" className="form-select">
              <option value="USD">USD (cobra en dolares)</option>
              <option value="VES">VES/BCV (cobra en bolivares)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Se usa para aplicar el ajuste cambiario solo a proveedores en USD.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="form-label" htmlFor="address">
              Dirección según RIF (opcional)
            </label>
            <input
              id="address"
              name="address"
              placeholder="Dirección completa tal como aparece en el RIF"
              className="form-input"
            />
          </div>

          <div>
            <span className="form-label">Imagen del RIF (opcional)</span>
            <MainImageUploader targetName="rifImageUrl" />
          </div>

          <div>
            <span className="form-label">Crédito</span>
            <div className="flex items-center gap-2 mt-1">
              <input
                id="givesCredit"
                name="givesCredit"
                type="checkbox"
                className="h-4 w-4"
              />
              <label htmlFor="givesCredit" className="text-sm text-gray-700">
                Otorga crédito
              </label>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="creditDays" className="text-sm text-gray-700">
                Días de crédito
              </label>
              <input
                id="creditDays"
                name="creditDays"
                type="number"
                min={0}
                className="form-input"
                placeholder="0"
              />
            </div>
          </div>

          <div className="md:col-span-3 flex justify-end">
            <PendingButton
              className="bg-green-600 text-white px-3 py-1 rounded"
              pendingText="Guardando…"
            >
              Guardar
            </PendingButton>
          </div>
        </form>
      </div>

      {/* Listado */}
      <div className="form-card">
        <h2 className="text-lg font-bold mb-2">Listado</h2>
        <details className="rounded border border-gray-200" open>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">
            Ver proveedores
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-md overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 w-56">Nombre</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 w-32">RIF / NIT</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 w-52">Email</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 w-40">Teléfono empresa</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 w-40">Contacto</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-700 w-28">Moneda</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-700 w-32">Crédito</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Dirección</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-700 w-32">RIF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suppliers.map((s: any) => (
                  <tr key={s.id} className="hover:bg-gray-50 align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900 truncate" title={s.name}>
                        {s.name}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                      {s.taxId || '—'}
                    </td>
                    <td className="px-3 py-3">
                      {s.email ? (
                        <a
                          href={`mailto:${s.email}`}
                          className="text-blue-600 hover:underline break-all text-xs"
                        >
                          {s.email}
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {s.phone || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">
                      {s.contactName ? (
                        <div className="space-y-0.5">
                          <div className="font-medium">{s.contactName}</div>
                          {s.contactPhone && (
                            <div className="text-xs text-gray-500 whitespace-nowrap">
                              {s.contactPhone}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-sm text-gray-700 whitespace-nowrap">
                      {String((s as any).chargeCurrency || 'USD') === 'VES' ? 'VES/BCV' : 'USD'}
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      {s.givesCredit ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Sí&nbsp;{s.creditDays ?? 0} días
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700">
                      {s.address ? (
                        <p className="line-clamp-3 leading-snug" title={s.address}>
                          {s.address}
                        </p>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {s.rifImageUrl ? (
                        <a
                          href={s.rifImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center px-2 py-1 text-xs font-semibold rounded-full bg-brand/10 text-brand hover:bg-brand/20"
                        >
                          Ver RIF
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* Editar proveedores */}
      <div className="form-card">
        <details className="rounded border border-gray-200" open>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">
            Editar proveedores
          </summary>
          <p className="text-sm text-gray-600 mb-2">
            Edita cualquier campo y guarda para aplicar cambios.
          </p>
          <div className="space-y-3">
            {suppliers.map((s: any) => (
              <form
                key={s.id}
                action={updateSupplier}
                className="grid grid-cols-1 md:grid-cols-8 gap-2 items-end"
              >
                <input type="hidden" name="id" value={s.id} />
                <input
                  name="name"
                  defaultValue={s.name}
                  placeholder="Nombre"
                  className="form-input"
                />
                <input
                  name="taxId"
                  defaultValue={s.taxId || ''}
                  placeholder="RIF/NIT"
                  className="form-input"
                />
                <input
                  name="email"
                  defaultValue={s.email || ''}
                  placeholder="Email"
                  className="form-input"
                />
                <input
                  name="phone"
                  defaultValue={s.phone || ''}
                  placeholder="Teléfono empresa"
                  className="form-input"
                />
                <input
                  name="contactName"
                  defaultValue={s.contactName || ''}
                  placeholder="Persona contacto"
                  className="form-input"
                />
                <input
                  name="contactPhone"
                  defaultValue={s.contactPhone || ''}
                  placeholder="Teléfono contacto"
                  className="form-input"
                />
                <div className="space-y-1">
                  <label className="text-xs text-gray-700">Moneda cobro</label>
                  <select
                    name="chargeCurrency"
                    defaultValue={(s as any).chargeCurrency || 'USD'}
                    className="form-select"
                  >
                    <option value="USD">USD</option>
                    <option value="VES">VES/BCV</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      id={`givesCredit-${s.id}`}
                      name="givesCredit"
                      type="checkbox"
                      defaultChecked={Boolean(s.givesCredit)}
                      className="h-4 w-4"
                    />
                    <label
                      htmlFor={`givesCredit-${s.id}`}
                      className="text-xs text-gray-700"
                    >
                      Otorga crédito
                    </label>
                  </div>
                  <input
                    name="creditDays"
                    type="number"
                    min={0}
                    defaultValue={s.creditDays ?? ''}
                    placeholder="Días"
                    className="form-input"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <input
                    name="address"
                    defaultValue={s.address || ''}
                    placeholder="Dirección según RIF"
                    className="form-input mb-1"
                  />
                  <div className="flex items-center gap-3 mb-1">
                    {s.rifImageUrl && (
                      <a
                        href={s.rifImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Ver RIF actual
                      </a>
                    )}
                    <span className="text-xs text-gray-500">
                      Subir nuevo RIF (opcional)
                    </span>
                  </div>
                  <MainImageUploader targetName="rifImageUrl" />
                </div>
                <PendingButton
                  className="bg-gray-800 text-white px-3 py-1 rounded"
                  pendingText="Guardando..."
                >
                  Guardar
                </PendingButton>
              </form>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
