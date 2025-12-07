'use client';

import { useEffect, useState } from 'react';

export function DriverLocationClient() {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Tu navegador no soporta geolocalización.');
      return;
    }

    let cancelled = false;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        setError(null);
        const payload = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        fetch('/api/drivers/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {
          // Silenciar errores de red en el cliente
        });
      },
      (err) => {
        if (cancelled) return;
        setError(err.message || 'No se pudo obtener tu ubicación.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      },
    );

    return () => {
      cancelled = true;
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        // ignore
      }
    };
  }, [enabled]);

  return (
    <div className="mt-2 p-3 border rounded bg-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">GPS en tiempo real</div>
          <div className="text-xs text-gray-600">
            Activa tu ubicación para que logística pueda ver por dónde vas.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          className={`px-3 py-1 rounded text-sm font-medium ${
            enabled ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-800'
          }`}
        >
          {enabled ? 'Desactivar' : 'Activar'}
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      {enabled && !error && (
        <div className="mt-2 text-xs text-green-700">
          Enviando tu ubicación periódicamente mientras esta página esté abierta.
        </div>
      )}
    </div>
  );
}

