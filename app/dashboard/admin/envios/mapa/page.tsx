\"use client\";

import dynamic from "next/dynamic";

const DeliveryMapClient = dynamic(
  () => import("./DeliveryMapClient"),
  { ssr: false },
);

export default function AdminEnviosMapaPage() {
  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Mapa de delivery · Barinas
          </h1>
          <p className="text-sm text-gray-600">
            Visualiza en tiempo real la última ubicación reportada por los
            repartidores DELIVERY aprobados y coordina la logística de envíos.
          </p>
        </div>
      </div>
      <DeliveryMapClient />
    </div>
  );
}
