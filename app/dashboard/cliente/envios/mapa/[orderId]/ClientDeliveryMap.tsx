'use client';

import { useEffect, useRef, useState } from 'react';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type TrackData = {
  ok: boolean;
  error?: string;
  shipping?: {
    status: string;
    carrier: string;
    updatedAt?: string;
  };
  destination?: {
    city: string;
    address: string;
  } | null;
  driver?: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
  position?: {
    lat: number;
    lng: number;
    updatedAt: string;
  };
};

const driverIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  shadowSize: [41, 41],
});

export default function ClientDeliveryMap({ orderId }: { orderId: string }) {
  const [data, setData] = useState<TrackData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/client/delivery/track/${orderId}`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as TrackData;
      if (!res.ok) {
        setError(json?.error || 'No se pudo cargar la ubicaci\u00f3n.');
        setData(null);
      } else {
        setError(json.ok ? null : json.error || null);
        setData(json);
      }
    } catch {
      setError('No se pudo conectar con el servidor.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    const pos = data?.position;
    if (!mapContainerRef.current || !pos) return;

    const center: LatLngExpression = [pos.lat, pos.lng];

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current).setView(center, 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng(center);
    } else if (mapRef.current) {
      const marker = L.marker(center, { icon: driverIcon });
      marker.addTo(mapRef.current);
      markerRef.current = marker;
    }
  }, [data?.position?.lat, data?.position?.lng]);

  const friendlyMessage = () => {
    if (!data) return null;
    if (data.ok && data.position) return null;
    const code = data.error;
    if (code === 'NOT_DELIVERY') {
      return 'Este pedido no usa delivery interno, por lo que no hay mapa en tiempo real.';
    }
    if (code === 'NO_DRIVER_ASSIGNED') {
      return 'Tu pedido est\u00e1 confirmado para delivery, pero a\u00fan no tiene repartidor asignado.';
    }
    if (code === 'NO_LOCATION_YET') {
      return 'Tu repartidor a\u00fan no ha reportado su ubicaci\u00f3n. Intenta actualizar en unos minutos.';
    }
    return (
      error ||
      'No podemos mostrar la ubicaci\u00f3n en este momento. Intenta de nuevo m\u00e1s tarde.'
    );
  };

  const statusLabel = () => {
    const status = String(data?.shipping?.status || '').toUpperCase();
    if (!status) return null;
    let label = status;
    if (status === 'PENDIENTE') label = 'Pendiente';
    else if (status === 'PREPARANDO') label = 'Preparando';
    else if (status === 'DESPACHADO') label = 'Despachado';
    else if (status === 'EN_TRANSITO') label = 'En tr\u00e1nsito';
    else if (status === 'ENTREGADO') label = 'Entregado';
    return label;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 text-sm text-gray-700">
        {data?.destination && (
          <div>
            <span className="font-semibold">Destino:</span>{' '}
            {data.destination.address}, {data.destination.city}
          </div>
        )}
        {data?.driver && (
          <div>
            <span className="font-semibold">Repartidor:</span>{' '}
            {data.driver.name || 'Delivery'}{' '}
            {data.driver.phone && (
              <span className="text-gray-500">({data.driver.phone})</span>
            )}
          </div>
        )}
        {data?.shipping && (
          <div>
            <span className="font-semibold">Estado del env\u00edo:</span>{' '}
            {statusLabel()}
          </div>
        )}
        {data?.position && (
          <div className="text-xs text-gray-500">
            \u00daltima actualizaci\u00f3n:{' '}
            {new Date(data.position.updatedAt).toLocaleTimeString()}
          </div>
        )}
      </div>

      <div className="relative w-full h-80 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
        {!data?.position && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 px-4 text-center">
            {friendlyMessage() || (loading ? 'Cargando mapa…' : null)}
          </div>
        )}
        <div
          ref={mapContainerRef}
          className="w-full h-full"
          aria-label="Mapa de ubicaci\u00f3n del delivery"
        />
      </div>

      <div className="flex justify-between items-center text-xs text-gray-500">
        <span>
          La ubicaci\u00f3n es aproximada y se actualiza cada 30 segundos.
        </span>
        <button
          type="button"
          onClick={load}
          className="px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          disabled={loading}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
    </div>
  );
}

