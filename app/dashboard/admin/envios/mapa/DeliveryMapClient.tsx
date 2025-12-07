"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, Chip, Button } from "@heroui/react";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Truck, RefreshCw, PackageOpen } from "lucide-react";

type DriverRow = {
  driverId: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  lat: number;
  lng: number;
  updatedAt: string;
};

type ShipmentRow = {
  id: string;
  orderId: string;
  status: string;
  city: string;
  address: string;
  customer: string;
  assignedToId: string | null;
  assignedToName: string | null;
  updatedAt: string;
};

const driverIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  shadowSize: [41, 41],
});

export default function DeliveryMapClient() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const center: LatLngExpression = useMemo(
    () => [8.6226, -70.2075], // Barinas aproximado
    [],
  );

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/delivery/overview");
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.ok) return;
      const drows = (data.drivers || []) as any[];
      const srows = (data.shipments || []) as any[];
      setDrivers(
        drows.map((r) => ({
          driverId: String(r.driverId),
          name: r.name || null,
          phone: r.phone || null,
          address: r.address || null,
          lat: Number(r.lat),
          lng: Number(r.lng),
          updatedAt: String(r.updatedAt),
        })),
      );
      setShipments(
        srows.map((s) => ({
          id: String(s.id),
          orderId: String(s.orderId),
          status: String(s.status),
          city: s.city || "",
          address: s.address || "",
          customer: s.customer || "",
          assignedToId: s.assignedToId || null,
          assignedToName: s.assignedToName || null,
          updatedAt: String(s.updatedAt),
        })),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const id = window.setInterval(fetchOverview, 30000);
    return () => window.clearInterval(id);
  }, []);

  const activeDrivers = drivers.length;
  const shipmentsByDriver: Record<string, ShipmentRow[]> = useMemo(() => {
    const map: Record<string, ShipmentRow[]> = {};
    for (const s of shipments) {
      if (s.assignedToId) {
        if (!map[s.assignedToId]) map[s.assignedToId] = [];
        map[s.assignedToId].push(s);
      }
    }
    return map;
  }, [shipments]);

  const unassignedShipments = useMemo(
    () => shipments.filter((s) => !s.assignedToId),
    [shipments],
  );

  // Inicializar mapa Leaflet una sola vez
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const map = L.map(mapContainerRef.current).setView(center, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    markersLayerRef.current = layer;
  }, [center]);

  // Actualizar marcadores cuando cambien los drivers
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    drivers.forEach((d) => {
      if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return;
      const marker = L.marker([d.lat, d.lng], { icon: driverIcon });
      const content = `
        <div style="font-size:11px;">
          <div style="font-weight:600;">${d.name || "Delivery sin nombre"}</div>
          ${d.phone ? `<div>Tel: ${d.phone}</div>` : ""}
          ${d.address ? `<div>Base: ${d.address}</div>` : ""}
          <div style="color:#6b7280;">Última actualización: ${new Date(
            d.updatedAt,
          ).toLocaleTimeString()}</div>
        </div>
      `;
      marker.bindPopup(content);
      marker.addTo(layer);
    });
  }, [drivers]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex-1">
        <Card className="border-0 shadow-md">
          <CardBody className="p-0">
            {/* Leaflet map needs fixed height */}
            <div className="h-[420px] w-full overflow-hidden rounded-xl">
              <div
                ref={mapContainerRef}
                className="h-full w-full"
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="w-full lg:w-80">
        <Card className="border-0 bg-white shadow-md">
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-amber-700" />
                <span className="text-sm font-semibold text-gray-800">
                  Flota de delivery · Barinas
                </span>
              </div>
              <Button
                size="sm"
                variant="light"
                startContent={<RefreshCw className="h-3 w-3" />}
                onPress={fetchOverview}
                isDisabled={loading}
              >
                {loading ? "Actualizando..." : "Actualizar"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-gray-600">
              <Chip size="sm" variant="flat" color="warning">
                Activos en mapa: {activeDrivers}
              </Chip>
              <Chip size="sm" variant="bordered" className="border-gray-200">
                Fuente: GPS de drivers DELIVERY aprobados
              </Chip>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {drivers.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-[11px] text-gray-500">
                  No tenemos ubicaciones activas. Pídeles a tus repartidores
                  que entren a su panel de delivery y activen el GPS.
                </div>
              )}
              {drivers.map((d) => (
                <div
                  key={d.driverId}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800">
                      {d.name || "Delivery"}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(d.updatedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {d.phone && (
                    <div className="text-gray-700">Tel: {d.phone}</div>
                  )}
                  {d.address && (
                    <div className="text-gray-700">Base: {d.address}</div>
                  )}
                  {shipmentsByDriver[d.driverId] && (
                    <div className="mt-1 space-y-1">
                      <div className="text-[10px] font-semibold text-gray-700">
                        Entregas asignadas: {shipmentsByDriver[d.driverId].length}
                      </div>
                      <ul className="space-y-0.5">
                        {shipmentsByDriver[d.driverId].slice(0, 3).map((s) => (
                          <li
                            key={s.id}
                            className="text-[10px] text-gray-700"
                          >
                            #{s.orderId.slice(0, 8)} · {s.city || "Sin ciudad"} ·{" "}
                            <span className="uppercase">{s.status}</span>
                          </li>
                        ))}
                        {shipmentsByDriver[d.driverId].length > 3 && (
                          <li className="text-[10px] text-gray-500">
                            + {shipmentsByDriver[d.driverId].length - 3} entregas más
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card className="mt-4 border-0 bg-white shadow-md">
          <CardBody className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PackageOpen className="h-4 w-4 text-blue-700" />
                <span className="text-sm font-semibold text-gray-800">
                  Entregas pendientes (sin asignar)
                </span>
              </div>
            </div>
            {unassignedShipments.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                No tienes entregas DELIVERY pendientes sin asignar.
              </div>
            )}
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {unassignedShipments.slice(0, 10).map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800">
                      #{s.orderId.slice(0, 8)} · {s.city || "Sin ciudad"}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(s.updatedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-gray-700">
                    {s.customer || "Cliente"} ·{" "}
                    <span className="uppercase">{s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
