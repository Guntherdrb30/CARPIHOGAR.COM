"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LeafletMouseEvent,
  Map as LeafletMap,
  Marker as LeafletMarker,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { venezuelaStates } from "@/lib/venezuela-regions";

type LeafletModule = typeof import("leaflet");
type LeafletImport = LeafletModule & { default?: LeafletModule };
type Props = {
  defaultState?: string;
  defaultCity?: string;
  defaultAddress?: string;
  defaultLat?: number | string | null;
  defaultLng?: number | string | null;
};

const initialCenter = { lat: 8.625, lng: -70.208 }; // Barinas approx

export default function BranchLocationFields({
  defaultState = "",
  defaultCity = "",
  defaultAddress = "",
  defaultLat = "",
  defaultLng = "",
}: Props) {
  const [stateName, setStateName] = useState(defaultState);
  const [cityName, setCityName] = useState(defaultCity);
  const [address, setAddress] = useState(defaultAddress);
  const [lat, setLat] = useState(
    defaultLat ? String(defaultLat) : String(initialCenter.lat)
  );
  const [lng, setLng] = useState(
    defaultLng ? String(defaultLng) : String(initialCenter.lng)
  );
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);

  const cityOptions = useMemo(() => {
    const match = venezuelaStates.find(
      (s) => s.name.toLowerCase() === stateName.toLowerCase()
    );
    return match ? match.cities : [];
  }, [stateName]);

  useEffect(() => {
    if (cityOptions.length && !cityOptions.includes(cityName)) {
      setCityName(cityOptions[0]);
    }
  }, [cityOptions, cityName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mapRef.current || !mapContainerRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      const module = (await import("leaflet")) as LeafletImport;
      if (cancelled || !mapContainerRef.current) return;
      const Leaflet = (module.default ?? module) as LeafletModule;
      leafletRef.current = Leaflet;
      const coords: [number, number] = [Number(lat), Number(lng)];
      const map = Leaflet.map(mapContainerRef.current).setView(coords, 13);
      Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      const marker = Leaflet.marker(coords, {
        draggable: true,
      }).addTo(map);
      marker.on("dragend", (event) => {
        const m = event.target as LeafletMarker;
        const pos = m.getLatLng();
        setLat(pos.lat.toFixed(6));
        setLng(pos.lng.toFixed(6));
      });
      map.on("click", (event: LeafletMouseEvent) => {
        const pos = event.latlng;
        setLat(pos.lat.toFixed(6));
        setLng(pos.lng.toFixed(6));
      });
      mapRef.current = map;
      markerRef.current = marker;
    };

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    const Leaflet = leafletRef.current;
    if (!map || !marker || !Leaflet) return;
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!isFinite(parsedLat) || !isFinite(parsedLng)) return;
    const nextPos = Leaflet.latLng(parsedLat, parsedLng);
    marker.setLatLng(nextPos);
    map.panTo(nextPos);
  }, [lat, lng]);

  const geocode = async () => {
    const queryParts = [address, cityName, stateName, "Venezuela"].filter(
      Boolean
    );
    if (!queryParts.length) return;
    try {
      setGeocodeLoading(true);
      const query = queryParts.join(", ");
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&limit=1`,
        {
          headers: {
            "Accept-Language": "es",
          },
        }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        const match = data[0];
        setLat(Number(match.lat).toFixed(6));
        setLng(Number(match.lon).toFixed(6));
      }
    } catch (err) {
      console.warn("Geocode error", err);
    } finally {
      setGeocodeLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Estado
            </label>
            <select
              name="state"
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              required
            >
              <option value="">Selecciona un estado</option>
              {venezuelaStates.map((state) => (
                <option key={state.name} value={state.name}>
                  {state.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Ciudad
            </label>
            <select
              name="city"
              value={cityName}
              onChange={(e) => setCityName(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              required
              disabled={!stateName}
            >
              <option value="">Selecciona una ciudad</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Direccion completa
          </label>
          <textarea
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Avenida, punto de referencia, etc."
            required
            className="w-full rounded border px-3 py-2 text-sm min-h-[60px]"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Latitud
            </label>
            <input
              name="lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              type="number"
              step="0.000001"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Longitud
            </label>
            <input
              name="lng"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              type="number"
              step="0.000001"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={geocode}
          disabled={geocodeLoading}
          className="inline-flex items-center rounded bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-blue-700 disabled:bg-gray-400"
        >
          {geocodeLoading ? "Buscando..." : "Buscar en mapa por direccion"}
        </button>
        <p className="text-[11px] text-gray-500">
          Puedes ajustar el marcador manualmente en el mapa para tomar las coordenadas exactas.
        </p>
      </div>
      <div>
        <div
          ref={mapContainerRef}
          className="w-full rounded border h-64 lg:h-full min-h-[260px]"
        />
      </div>
    </div>
  );
}
