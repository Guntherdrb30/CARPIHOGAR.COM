import ClientDeliveryMap from './ClientDeliveryMap';

export const dynamic = 'force-dynamic';

export default async function ClienteEnvioMapaPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Seguimiento de tu delivery
          </h1>
          <p className="text-sm text-gray-600">
            Aqu\u00ed puedes ver la ubicaci\u00f3n aproximada de tu repartidor
            cuando el env\u00edo usa delivery interno.
          </p>
        </div>
        <a
          href="/dashboard/cliente/envios"
          className="text-sm border px-3 py-1 rounded"
        >
          Volver a mis env\u00edos
        </a>
      </div>

      <ClientDeliveryMap orderId={orderId} />
    </div>
  );
}

