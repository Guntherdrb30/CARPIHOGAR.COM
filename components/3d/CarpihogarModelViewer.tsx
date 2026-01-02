'use client';

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import * as THREE from 'three';

type Model3DStatus = 'NOT_CONFIGURED' | 'PENDING' | 'PROCESSING' | 'READY' | 'ERROR';

type ViewerProps = {
  productId: string;
  productName?: string | null;
  sku?: string | null;
  category?: string | null;
  furnitureType?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  depthCm?: number | null;
  isAdmin?: boolean;
  showPanel?: boolean;
  className?: string;
  viewerClassName?: string;
};

export function positionModelToCenter(model: THREE.Object3D) {
  const initialBox = new THREE.Box3().setFromObject(model);
  const center = initialBox.getCenter(new THREE.Vector3());
  model.position.sub(center);

  const centeredBox = new THREE.Box3().setFromObject(model);
  if (Number.isFinite(centeredBox.min.y)) {
    model.position.y -= centeredBox.min.y;
  }

  return new THREE.Box3().setFromObject(model);
}

export function fitCameraToModel(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void } | null,
  box: THREE.Box3,
  padding = 1.25,
) {
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);

  const radius = sphere.radius > 0 ? sphere.radius * padding : 1;
  const fov = (camera.fov * Math.PI) / 180;
  const distance = radius / Math.sin(fov / 2);

  const direction = new THREE.Vector3(1, 0.8, 1).normalize();
  camera.position.copy(sphere.center).add(direction.multiplyScalar(distance));
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(sphere.center);
    controls.update();
  }
}

export function onModelLoaded(
  model: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void } | null,
) {
  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      if (geometry && !geometry.attributes.normal) {
        geometry.computeVertexNormals();
      }
    }
  });

  const box = positionModelToCenter(model);
  fitCameraToModel(camera, controls, box);
}

function LoadingFallback() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="rounded bg-white/80 px-3 py-2 text-xs text-gray-600 shadow">
        Cargando modelo 3D... {Math.round(progress)}%
      </div>
    </Html>
  );
}

function StatusMessage({
  message,
  showSpinner = false,
}: {
  message: string;
  showSpinner?: boolean;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="max-w-md rounded-lg bg-white/90 px-4 py-3 text-center text-xs text-gray-600 shadow">
        {showSpinner && (
          <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        )}
        {message}
      </div>
    </div>
  );
}

function ModelLoadError() {
  return (
    <Html center>
      <div className="rounded bg-white/90 px-4 py-3 text-xs text-gray-600 shadow">
        No pudimos cargar el modelo 3D. Contacte soporte tecnico.
      </div>
    </Html>
  );
}

class ModelErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function PanelCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function formatDimension(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '--';
  return `${Number(value).toFixed(1)} cm`;
}

function Model({
  url,
  controlsRef,
}: {
  url: string;
  controlsRef: MutableRefObject<any>;
}) {
  const { scene } = useGLTF(url);
  const { camera } = useThree();
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    onModelLoaded(clonedScene, camera as THREE.PerspectiveCamera, controlsRef.current);
  }, [clonedScene, camera, controlsRef]);

  return <primitive object={clonedScene} />;
}

export default function CarpihogarModelViewer({
  productId,
  productName,
  sku,
  category,
  furnitureType,
  widthCm,
  heightCm,
  depthCm,
  isAdmin = false,
  showPanel = true,
  className,
  viewerClassName,
}: ViewerProps) {
  const controlsRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Model3DStatus>('NOT_CONFIGURED');
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(
        `/api/3d/model-status?productId=${encodeURIComponent(productId)}`,
        { cache: 'no-store' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'status error');
      }

      const nextStatus: Model3DStatus =
        data?.status === 'PENDING' ||
        data?.status === 'PROCESSING' ||
        data?.status === 'READY' ||
        data?.status === 'ERROR' ||
        data?.status === 'NOT_CONFIGURED'
          ? data.status
          : 'ERROR';

      setStatus(nextStatus);
      if (nextStatus === 'READY') {
        setGlbUrl(
          typeof data?.glbUrl === 'string' && data.glbUrl
            ? data.glbUrl
            : `/api/3d/model-file?productId=${encodeURIComponent(productId)}`,
        );
      } else {
        setGlbUrl(null);
      }
    } catch {
      setStatus('ERROR');
      setGlbUrl(null);
    } finally {
      setStatusLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    let active = true;
    fetchStatus().catch(() => {});
    return () => {
      active = false;
    };
  }, [fetchStatus]);

  const handleAdminUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadMessage(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('productId', productId);
      formData.append('file', file);

      const res = await fetch('/api/3d/upload-skp', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'upload failed');
      }
      setUploadMessage('Archivo recibido. Conversion en cola.');
      await fetchStatus();
    } catch {
      setUploadMessage('No se pudo subir el modelo 3D.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const frameClass = viewerClassName || 'w-full h-[520px] rounded-lg overflow-hidden';
  const containerClass =
    className ||
    (showPanel ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start' : 'w-full');

  const statusLabel =
    status === 'READY'
      ? 'READY'
      : status === 'PENDING' || status === 'PROCESSING' || statusLoading
        ? 'EN PROCESO'
        : 'NO DISPONIBLE';

  const canDownload = status === 'READY';

  return (
    <div className={containerClass}>
      <div className={frameClass} style={{ background: '#f3f3f3' }}>
        {statusLoading ? (
          <StatusMessage message="Cargando modelo 3D..." showSpinner />
        ) : status === 'PENDING' || status === 'PROCESSING' ? (
          <StatusMessage
            message="Estamos procesando el modelo 3D de este mueble. Vuelve en unos minutos."
            showSpinner
          />
        ) : status === 'ERROR' ? (
          <StatusMessage message="No pudimos generar el modelo 3D. Contacte soporte tecnico." />
        ) : status === 'NOT_CONFIGURED' || !glbUrl ? (
          <StatusMessage message="Este producto aun no tiene modelo 3D disponible." />
        ) : (
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [4, 4, 4], fov: 45, near: 0.1, far: 2000 }}
            onCreated={({ gl }) => {
              gl.setClearColor('#f3f3f3');
              gl.shadowMap.enabled = true;
              gl.shadowMap.type = THREE.PCFSoftShadowMap;
            }}
          >
            <color attach="background" args={['#f3f3f3']} />

            <ambientLight intensity={0.6} />
            <spotLight
              position={[6, 10, 6]}
              intensity={0.9}
              angle={0.35}
              penumbra={0.6}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
            />

            <ModelErrorBoundary fallback={<ModelLoadError />}>
              <Suspense fallback={<LoadingFallback />}>
                <Model url={glbUrl} controlsRef={controlsRef} />
              </Suspense>
            </ModelErrorBoundary>

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
              <planeGeometry args={[30, 30]} />
              <shadowMaterial opacity={0.22} />
            </mesh>

            <OrbitControls
              ref={controlsRef}
              enableDamping
              dampingFactor={0.08}
              rotateSpeed={0.6}
              enablePan
              enableZoom
            />
          </Canvas>
        )}
      </div>

      {showPanel && (
        <>
          <div className="hidden lg:block">
            <aside className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Informacion del producto</h3>
                <p className="text-xs text-gray-500">
                  Datos base del mueble y estado del modelo 3D.
                </p>
              </div>

              <div className="grid gap-3">
                <PanelCard label="Nombre" value={productName || '--'} />
                <PanelCard label="SKU / Codigo" value={sku || '--'} />
                <PanelCard label="Categoria" value={category || '--'} />
                <PanelCard label="Tipo de mueble" value={furnitureType || '--'} />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">Medidas base</div>
                <div className="grid grid-cols-3 gap-2">
                  <PanelCard label="Ancho" value={formatDimension(widthCm)} />
                  <PanelCard label="Alto" value={formatDimension(heightCm)} />
                  <PanelCard label="Prof." value={formatDimension(depthCm)} />
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-gray-400">
                  Estado modelo 3D
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{statusLabel}</span>
                  <span
                    className={
                      statusLabel === 'READY'
                        ? 'text-[11px] font-semibold text-emerald-600'
                        : statusLabel === 'EN PROCESO'
                          ? 'text-[11px] font-semibold text-amber-600'
                          : 'text-[11px] font-semibold text-gray-400'
                    }
                  >
                    {statusLabel === 'READY'
                      ? 'Listo'
                      : statusLabel === 'EN PROCESO'
                        ? 'Procesando'
                        : 'Sin archivo'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {canDownload ? (
                  <a
                    className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
                    href={`/api/3d/model-file?productId=${encodeURIComponent(productId)}`}
                    download={`${productName || 'modelo'}.glb`}
                  >
                    Descargar archivo GLB
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex w-full items-center justify-center rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-500"
                  >
                    Descargar archivo GLB
                  </button>
                )}

                {isAdmin && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? 'Subiendo...' : 'Subir nuevo modelo 3D'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".skp"
                      className="hidden"
                      onChange={handleAdminUpload}
                    />
                    {uploadMessage && (
                      <div className="text-[11px] text-gray-500">{uploadMessage}</div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>

          <details className="lg:hidden rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900">
              Informacion del producto
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3">
                <PanelCard label="Nombre" value={productName || '--'} />
                <PanelCard label="SKU / Codigo" value={sku || '--'} />
                <PanelCard label="Categoria" value={category || '--'} />
                <PanelCard label="Tipo de mueble" value={furnitureType || '--'} />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">Medidas base</div>
                <div className="grid grid-cols-3 gap-2">
                  <PanelCard label="Ancho" value={formatDimension(widthCm)} />
                  <PanelCard label="Alto" value={formatDimension(heightCm)} />
                  <PanelCard label="Prof." value={formatDimension(depthCm)} />
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-gray-400">
                  Estado modelo 3D
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{statusLabel}</span>
                  <span
                    className={
                      statusLabel === 'READY'
                        ? 'text-[11px] font-semibold text-emerald-600'
                        : statusLabel === 'EN PROCESO'
                          ? 'text-[11px] font-semibold text-amber-600'
                          : 'text-[11px] font-semibold text-gray-400'
                    }
                  >
                    {statusLabel === 'READY'
                      ? 'Listo'
                      : statusLabel === 'EN PROCESO'
                        ? 'Procesando'
                        : 'Sin archivo'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {canDownload ? (
                  <a
                    className="inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
                    href={`/api/3d/model-file?productId=${encodeURIComponent(productId)}`}
                    download={`${productName || 'modelo'}.glb`}
                  >
                    Descargar archivo GLB
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex w-full items-center justify-center rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-500"
                  >
                    Descargar archivo GLB
                  </button>
                )}

                {isAdmin && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? 'Subiendo...' : 'Subir nuevo modelo 3D'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".skp"
                      className="hidden"
                      onChange={handleAdminUpload}
                    />
                    {uploadMessage && (
                      <div className="text-[11px] text-gray-500">{uploadMessage}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
