import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPurchaseById, updatePurchaseByForm, deletePurchaseByForm } from '@/server/actions/procurement';
import ShowToastFromSearch from '@/components/show-toast-from-search';
import SecretDeleteButton from '@/components/admin/secret-delete-button';

export default async function PurchaseIADetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ message?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if (!session || (!role || (role !== 'ADMIN' && role !== 'VENDEDOR'))) {
    return <div className="p-4">No autorizado</div> as any;
  }
  const canEdit = role === 'ADMIN';

  const { id } = await params;
  const sp = (await searchParams) || {};
  const message = (sp as any).message as string | undefined;
  const error = (sp as any).error as string | undefined;

  const purchase = await getPurchaseById(id);
  if (!purchase) {
    return <div className="container mx-auto p-4">Compra no encontrada</div>;
  }

  const subtotalUSD = Number(purchase.subtotalUSD || 0);
  const totalUSD = Number(purchase.totalUSD || purchase.subtotalUSD || 0);
  const ivaPercent = Number((purchase as any).ivaPercent || 0);
  const ivaAmountUSD = Number((purchase as any).ivaAmountUSD || 0);
  const igtfPercent = Number((purchase as any).igtfPercent || 0);
  const igtfAmountUSD = Number((purchase as any).igtfAmountUSD || 0);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <ShowToastFromSearch successParam="message" errorParam="error" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Factura de entrada {purchase.id.slice(-6)}
        </h1>
        <a
          href="/dashboard/admin/compras"
          className="border px-3 py-1 rounded"
        >
          Volver
        </a>
      </div>

      {message && (
        <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">
          {message}
        </div>
      )}
      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">
          {error}
        </div>
      )}

      
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Datos de la factura de entrada</h2>
        {canEdit ? (
          <form action={updatePurchaseByForm} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="hidden" name="purchaseId" value={purchase.id} />
            <div>
              <div className="text-sm text-gray-600">Proveedor</div>
              <div>{purchase.supplier?.name || '-'}</div>
            </div>
            <div>
              <label className="block text-sm text-gray-700">Nro factura</label>
              <input
                name="invoiceNumber"
                className="form-input"
                defaultValue={purchase.invoiceNumber || ''}
                placeholder="Numero de factura del proveedor"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Fecha factura</label>
              <input
                name="invoiceDate"
                type="date"
                className="form-input"
                defaultValue={
                  purchase.invoiceDate
                    ? new Date(purchase.invoiceDate as any)
                        .toISOString()
                        .slice(0, 10)
                    : ''
                }
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm text-gray-700">Notas internas</label>
              <textarea
                name="notes"
                className="form-input"
                rows={2}
                defaultValue={purchase.notes || ''}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Base imponible USD</label>
              <input
                name="baseAmountUSD"
                type="number"
                step="0.01"
                className="form-input"
                defaultValue={
                  (purchase as any).baseAmountUSD
                    ? String(Number((purchase as any).baseAmountUSD))
                    : subtotalUSD.toFixed(2)
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">% Descuento</label>
              <input
                name="discountPercent"
                type="number"
                step="0.01"
                className="form-input"
                defaultValue={
                  (purchase as any).discountPercent != null
                    ? String(Number((purchase as any).discountPercent))
                    : ''
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">% IVA</label>
              <input
                name="ivaPercent"
                type="number"
                step="0.01"
                className="form-input"
                defaultValue={ivaPercent.toFixed(2)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Monto IVA USD</label>
              <input
                name="ivaAmountUSD"
                type="number"
                step="0.01"
                className="form-input"
                defaultValue={ivaAmountUSD.toFixed(2)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Total factura USD</label>
              <input
                name="totalUSD"
                type="number"
                step="0.01"
                className="form-input"
                defaultValue={totalUSD.toFixed(2)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">% IGTF</label>
              <input
                name="igtfPercent"
                type="number"
                step="0.01"
                className="form-input"
                defaultValue={
                  igtfPercent ? igtfPercent.toFixed(2) : ''
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Monto IGTF USD</label>
              <input
                name="igtfAmountUSD"
                type="number"
                step="0.01"
                className="form-input"
                defaultValue={
                  igtfAmountUSD ? igtfAmountUSD.toFixed(2) : ''
                }
              />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <button
                type="submit"
                className="bg-blue-600 text-white px-3 py-1 rounded"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-gray-600">Proveedor</div>
              <div className="font-medium">{purchase.supplier?.name || '-'}</div>
            </div>
            <div>
              <div className="text-gray-600">Nro factura</div>
              <div className="font-medium">{purchase.invoiceNumber || '-'}</div>
            </div>
            <div>
              <div className="text-gray-600">Fecha factura</div>
              <div className="font-medium">
                {purchase.invoiceDate ? new Date(purchase.invoiceDate as any).toLocaleDateString() : '-'}
              </div>
            </div>
            <div className="md:col-span-3">
              <div className="text-gray-600">Notas internas</div>
              <div className="font-medium whitespace-pre-wrap">{purchase.notes || '-'}</div>
            </div>
            <div>
              <div className="text-gray-600">Base imponible USD</div>
              <div className="font-medium">
                {(purchase as any).baseAmountUSD ? Number((purchase as any).baseAmountUSD).toFixed(2) : subtotalUSD.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-gray-600">% Descuento</div>
              <div className="font-medium">
                {(purchase as any).discountPercent != null ? Number((purchase as any).discountPercent).toFixed(2) : '-'}
              </div>
            </div>
            <div>
              <div className="text-gray-600">% IVA</div>
              <div className="font-medium">{ivaPercent.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-600">Monto IVA USD</div>
              <div className="font-medium">{ivaAmountUSD.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-600">Total factura USD</div>
              <div className="font-medium">{totalUSD.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-600">% IGTF</div>
              <div className="font-medium">{igtfPercent ? igtfPercent.toFixed(2) : '-'}</div>
            </div>
            <div>
              <div className="text-gray-600">Monto IGTF USD</div>
              <div className="font-medium">{igtfAmountUSD ? igtfAmountUSD.toFixed(2) : '-'}</div>
            </div>
          </div>
        )}
      </div>

<div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Resumen de montos</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-gray-600">Subtotal USD</div>
            <div className="font-semibold">${subtotalUSD.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-gray-600">IVA ({ivaPercent.toFixed(2)}%)</div>
            <div className="font-semibold">${ivaAmountUSD.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-gray-600">
              IGTF ({igtfPercent.toFixed(2)}%) (si aplica)
            </div>
            <div className="font-semibold">
              {igtfAmountUSD ? `$${igtfAmountUSD.toFixed(2)}` : '-'}
            </div>
          </div>
          <div>
            <div className="text-gray-600">Total factura USD</div>
            <div className="font-semibold">${totalUSD.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2">Cant.</th>
                <th className="px-3 py-2">Costo USD</th>
                <th className="px-3 py-2">Subtotal USD</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((it: any) => (
                <tr key={it.id}>
                  <td className="border px-3 py-2">
                    {it.product?.name || it.name}
                  </td>
                  <td className="border px-3 py-2 text-center">
                    {it.quantity}
                  </td>
                  <td className="border px-3 py-2 text-right">
                    {Number(it.costUSD).toFixed(2)}
                  </td>
                  <td className="border px-3 py-2 text-right">
                    {Number(it.subtotalUSD).toFixed(2)}
                  </td>
                </tr>
              ))}
              {purchase.items.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-2 text-sm text-gray-500"
                    colSpan={4}
                  >
                    No hay items registrados en esta compra.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && (
      <div className="bg-white p-4 rounded-lg shadow">
              <h2 className="text-lg font-semibold mb-2">Acciones avanzadas</h2>
              <p className="text-sm text-gray-600 mb-3">
                Puedes eliminar esta compra solo con la clave secreta del administrador.
                Esta acción revertirá el stock, eliminará la cuenta por pagar y los
                movimientos bancarios asociados.
              </p>
              <SecretDeleteButton
                action={deletePurchaseByForm}
                hidden={{ purchaseId: purchase.id }}
                label="Eliminar compra"
                title="Eliminar compra"
                description="Esta acción revertirá esta compra (stock, bancos y cuentas por pagar). Es permanente y requiere la clave secreta del administrador."
              />
            </div>
    )}

    </div>
  );
}
