import { getServerSession } from 'next-auth';
import ImageLightbox from '@/components/admin/image-lightbox';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPendingDeliveries, approveDeliveryByForm, rejectDeliveryByForm } from '@/server/actions/users';

export default async function DeliveryRequestsPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'ADMIN') redirect('/auth/login');
  const pending = await getPendingDeliveries();

  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Solicitudes de Delivery</h1>
      {pending.length === 0 ? (
        <div className="text-gray-600">No hay solicitudes pendientes.</div>
      ) : (
        <div className="bg-white rounded shadow divide-y">
          {pending.map((u: any) => (
            <div key={u.id} className="p-4 grid grid-cols-1 items-start gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <div className="font-semibold">{u.name || u.email}</div>
                <div className="text-sm text-gray-700">Email: {u.email}</div>
                <div className="text-sm text-gray-700">Tel: {u.phone || '-'}</div>
                <div className="text-sm text-gray-700">Cédula: {u.deliveryCedula || '-'}</div>
                <div className="text-sm text-gray-700">Dirección: {u.deliveryAddress || '-'}</div>
                <div className="text-sm text-gray-700">Placa moto: {u.deliveryMotoPlate || '-'}</div>
                <div className="text-sm text-gray-700">Serial carrocería: {u.deliveryChassisSerial || '-'}</div>
                <div className="mt-2 text-xs text-gray-600">
                  Contrato firmado:{' '}
                  {u.deliverySignedContractUrl ? (
                    <a
                      href={u.deliverySignedContractUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      Ver archivo
                    </a>
                  ) : (
                    <span className="text-amber-700">Pendiente de carga</span>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="mb-1 text-xs text-gray-600">Foto Cédula</div>
                  {u.deliveryIdImageUrl ? (
                    <ImageLightbox src={u.deliveryIdImageUrl} alt="Foto cédula" />
                  ) : (
                    <div className="text-sm text-gray-500">No cargada</div>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-xs text-gray-600">Selfie</div>
                  {u.deliverySelfieUrl ? (
                    <ImageLightbox src={u.deliverySelfieUrl} alt="Selfie de registro" />
                  ) : (
                    <div className="text-sm text-gray-500">No cargada</div>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-stretch gap-3">
                <form action={approveDeliveryByForm} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <button className="rounded bg-green-600 px-3 py-2 text-sm text-white">Aprobar</button>
                  <a
                    href="/api/delivery/contrato/pdf"
                    target="_blank"
                    className="text-xs text-blue-600 underline"
                  >
                    Ver contrato PDF
                  </a>
                </form>
                <form action={rejectDeliveryByForm} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <button className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
                    Rechazar
                  </button>
                </form>
                <form
                  action="/api/admin/delivery/contrato-firmado"
                  method="POST"
                  encType="multipart/form-data"
                  className="space-y-1 text-xs text-gray-700"
                >
                  <input type="hidden" name="userId" value={u.id} />
                  <label className="block">
                    <span className="mb-1 block">Subir contrato firmado (PDF/JPG/PNG)</span>
                    <input
                      type="file"
                      name="file"
                      accept=".pdf,image/*"
                      className="block w-full text-xs"
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="mt-1 inline-flex items-center rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                  >
                    Guardar contrato firmado
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

