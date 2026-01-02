'use client';

import { useCallback, useEffect, useState } from 'react';

type Model3DStatus = 'NOT_CONFIGURED' | 'PENDING' | 'PROCESSING' | 'READY' | 'ERROR';

type Model3DState = {
  status: Model3DStatus;
  glbUrl: string | null;
  lastError: string | null;
};

const initialState: Model3DState = {
  status: 'NOT_CONFIGURED',
  glbUrl: null,
  lastError: null,
};

export default function Model3DPanel({ productId }: { productId: string }) {
  const [state, setState] = useState<Model3DState>(initialState);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/3d/model-status?productId=${encodeURIComponent(productId)}`,
        { cache: 'no-store' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({
          status: data.status || 'ERROR',
          glbUrl: data.glbUrl ?? null,
          lastError: data.lastError || data.error || 'error de estado',
        });
        return;
      }
      setState({
        status: data.status || 'NOT_CONFIGURED',
        glbUrl: data.glbUrl ?? null,
        lastError: data.lastError ?? null,
      });
    } catch {
      setState({ status: 'ERROR', glbUrl: null, lastError: 'estado no disponible' });
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get('file');

    if (!(file instanceof File) || !file.name) {
      setMessage('Selecciona un archivo .skp.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.skp')) {
      setMessage('El archivo debe ser .skp.');
      return;
    }

    formData.append('productId', productId);

    setUploading(true);
    try {
      const res = await fetch('/api/3d/upload-skp', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || 'No se pudo subir.');
        return;
      }
      setMessage('Archivo recibido. Conversion en cola.');
      form.reset();
      await fetchStatus();
    } catch {
      setMessage('No se pudo subir.');
    } finally {
      setUploading(false);
    }
  };

  // GLB endpoint for future Three.js / React Three Fiber viewer integration.
  const viewerUrl =
    state.glbUrl || `/api/3d/model-file?productId=${encodeURIComponent(productId)}`;

  return (
    <div className="border rounded p-3 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Modelo 3D</h3>
        <button
          type="button"
          className="text-xs border rounded px-2 py-1"
          onClick={fetchStatus}
          disabled={loading || uploading}
        >
          Actualizar estado
        </button>
      </div>

      <div className="mt-2 text-sm">
        <span className="text-gray-600">Estado:</span>{' '}
        <span className="font-medium">
          {loading ? 'Cargando...' : state.status}
        </span>
      </div>

      {state.status === 'ERROR' && state.lastError && (
        <div className="mt-1 text-xs text-red-600">Error: {state.lastError}</div>
      )}

      {state.status === 'READY' && (
        <div className="mt-2">
          <a
            className="inline-block bg-blue-600 text-white px-3 py-1 rounded"
            href={viewerUrl}
            target="_blank"
            rel="noreferrer"
          >
            Probar en visor 3D
          </a>
          <p className="mt-1 text-xs text-gray-500">
            Esta URL GLB se usara luego en el visor Three.js / React Three Fiber.
          </p>
        </div>
      )}

      {state.status === 'NOT_CONFIGURED' && (
        <div className="mt-1 text-xs text-gray-500">
          No hay modelo configurado. Sube un .skp para iniciar la conversion.
        </div>
      )}

      <form className="mt-3 flex flex-col md:flex-row md:items-center gap-2" onSubmit={handleUpload}>
        <input type="file" name="file" accept=".skp" className="text-sm" />
        <button
          type="submit"
          className="bg-emerald-600 text-white px-3 py-1 rounded"
          disabled={uploading}
        >
          {uploading ? 'Subiendo...' : 'Subir nuevo modelo .skp'}
        </button>
      </form>

      {message && <div className="mt-1 text-xs text-gray-600">{message}</div>}
    </div>
  );
}
