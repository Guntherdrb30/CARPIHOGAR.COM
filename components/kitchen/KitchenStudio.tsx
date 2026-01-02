"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import CarpihogarModelViewer from "@/components/3d/CarpihogarModelViewer";

type KitchenPriceTier = "LOW" | "MEDIUM" | "HIGH";
type KitchenLayoutType =
  | "LINEAL"
  | "L_SHAPE"
  | "DOUBLE_LINE"
  | "LINEAL_WITH_ISLAND"
  | "L_WITH_ISLAND"
  | "L_WITH_PENINSULA"
  | "CUSTOM_SPACE";

type KitchenModuleProduct = {
  id: string;
  name: string;
  sku?: string | null;
  code?: string | null;
  kitchenCategory?: string | null;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  widthMinMm?: number | null;
  widthMaxMm?: number | null;
  kitchenPriceLowUsd?: number | null;
  kitchenPriceMidUsd?: number | null;
  kitchenPriceHighUsd?: number | null;
  basePriceUsd?: number | null;
  priceUSD?: number | null;
};

type SelectedModule = {
  productId: string;
  name: string;
  widthMm: number;
  unitPriceUsd: number;
  quantity: number;
};

type PlacementZone = "FLOOR" | "WALL";

type PlacedModule = {
  id: string;
  productId: string;
  name: string;
  widthMm: number;
  depthMm: number;
  zone: PlacementZone;
  positionX: number;
  positionY: number;
  mountHeightMm: number;
};

type KitchenStudioProps = {
  modules: KitchenModuleProduct[];
  isAuthenticated: boolean;
  isRoot: boolean;
};

const PRICE_TIERS: Array<{
  value: KitchenPriceTier;
  label: string;
  description: string;
}> = [
  {
    value: "LOW",
    label: "Baja gama",
    description: "Solucion funcional con precio accesible.",
  },
  {
    value: "MEDIUM",
    label: "Media gama",
    description: "Balance ideal entre calidad y presupuesto.",
  },
  {
    value: "HIGH",
    label: "Alta gama",
    description: "Materiales premium y detalles superiores.",
  },
];

const LAYOUT_OPTIONS: Array<{
  value: KitchenLayoutType;
  label: string;
  description: string;
}> = [
  { value: "LINEAL", label: "Cocina lineal", description: "Una sola pared principal." },
  { value: "LINEAL_WITH_ISLAND", label: "Lineal con isla", description: "Linea principal + isla central." },
  { value: "L_SHAPE", label: "Cocina en L", description: "Dos paredes en angulo." },
  { value: "L_WITH_PENINSULA", label: "L con peninsula", description: "L principal + peninsula." },
  { value: "L_WITH_ISLAND", label: "L con isla", description: "L principal + isla central." },
  { value: "DOUBLE_LINE", label: "Lineal doble", description: "Dos frentes paralelos." },
  { value: "CUSTOM_SPACE", label: "Espacio libre", description: "Diseno personalizado." },
];

const LAYOUT_SHAPES: Record<
  KitchenLayoutType,
  Array<{ x: number; y: number; w: number; h: number; variant?: "island" | "peninsula" }>
> = {
  LINEAL: [{ x: 8, y: 8, w: 84, h: 10 }],
  LINEAL_WITH_ISLAND: [
    { x: 8, y: 8, w: 84, h: 10 },
    { x: 32, y: 32, w: 36, h: 12, variant: "island" },
  ],
  L_SHAPE: [
    { x: 8, y: 8, w: 60, h: 10 },
    { x: 8, y: 8, w: 10, h: 36 },
  ],
  L_WITH_PENINSULA: [
    { x: 8, y: 8, w: 60, h: 10 },
    { x: 8, y: 8, w: 10, h: 36 },
    { x: 48, y: 22, w: 36, h: 10, variant: "peninsula" },
  ],
  L_WITH_ISLAND: [
    { x: 8, y: 8, w: 60, h: 10 },
    { x: 8, y: 8, w: 10, h: 36 },
    { x: 40, y: 32, w: 32, h: 12, variant: "island" },
  ],
  DOUBLE_LINE: [
    { x: 8, y: 8, w: 84, h: 10 },
    { x: 8, y: 36, w: 84, h: 10 },
  ],
  CUSTOM_SPACE: [{ x: 18, y: 16, w: 64, h: 24 }],
};

const LAYOUT_FIELDS: Record<
  KitchenLayoutType,
  Array<{ wallName: string; label: string; isSeparation?: boolean }>
> = {
  LINEAL: [{ wallName: "WALL_A", label: "Largo de pared" }],
  L_SHAPE: [
    { wallName: "WALL_A", label: "Pared A largo" },
    { wallName: "WALL_B", label: "Pared B largo" },
  ],
  DOUBLE_LINE: [
    { wallName: "LINE_A", label: "Largo linea A" },
    { wallName: "LINE_B", label: "Largo linea B" },
    { wallName: "SEPARATION", label: "Separacion entre paredes", isSeparation: true },
  ],
  LINEAL_WITH_ISLAND: [{ wallName: "WALL_A", label: "Largo de pared" }],
  L_WITH_ISLAND: [
    { wallName: "WALL_A", label: "Pared A largo" },
    { wallName: "WALL_B", label: "Pared B largo" },
  ],
  L_WITH_PENINSULA: [
    { wallName: "WALL_A", label: "Pared A largo" },
    { wallName: "WALL_B", label: "Pared B largo" },
  ],
  CUSTOM_SPACE: [],
};

const CATEGORY_LABELS: Record<string, string> = {
  TOWER: "Torres",
  PANTRY: "Alacenas",
  OTHER: "Alacenas",
  FRIDGE: "Neveras",
  LOW: "Muebles bajos",
  HIGH: "Muebles altos",
  CONDIMENT: "Condimenteros",
};

const CATEGORY_ORDER = [
  "Torres",
  "Alacenas",
  "Neveras",
  "Muebles bajos",
  "Muebles altos",
  "Condimenteros",
];

const DEFAULT_MODULE_DEPTH_MM = 600;
const WALL_MOUNT_HEIGHT_MM = 1500;

const toNumberSafe = (value: any) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value?.toNumber === "function") return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMoney = (value: number) => `$${value.toFixed(2)}`;

const resolveTierPrice = (product: KitchenModuleProduct, tier: KitchenPriceTier) => {
  const low = toNumberSafe(product.kitchenPriceLowUsd) || 0;
  const mid = toNumberSafe(product.kitchenPriceMidUsd) || 0;
  const high = toNumberSafe(product.kitchenPriceHighUsd) || 0;
  if (tier === "LOW" && low > 0) return low;
  if (tier === "MEDIUM" && mid > 0) return mid;
  if (tier === "HIGH" && high > 0) return high;
  const base = toNumberSafe(product.basePriceUsd) || toNumberSafe(product.priceUSD) || 0;
  return base;
};

const resolveWidthMm = (product: KitchenModuleProduct) => {
  const width = toNumberSafe(product.widthMm);
  const min = toNumberSafe(product.widthMinMm);
  const max = toNumberSafe(product.widthMaxMm);
  return width || min || max || 600;
};

const resolveDepthMm = (product: KitchenModuleProduct) => {
  const depth = toNumberSafe(product.depthMm);
  return depth || DEFAULT_MODULE_DEPTH_MM;
};

const resolveCategoryLabel = (product: KitchenModuleProduct) =>
  CATEGORY_LABELS[String(product.kitchenCategory || "OTHER")] || "Sin categoria";

const resolvePlacementZone = (product: KitchenModuleProduct): PlacementZone =>
  resolveCategoryLabel(product) === "Muebles altos" ? "WALL" : "FLOOR";

const createPlacedId = (productId: string) =>
  `${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function LayoutPreview({ type, isActive }: { type: KitchenLayoutType; isActive: boolean }) {
  const shapes = LAYOUT_SHAPES[type] || [];
  const background = isActive ? "#0f172a" : "#f8fafc";
  const counter = isActive ? "#f8fafc" : "#334155";
  const island = isActive ? "#e2e8f0" : "#64748b";
  const outline = isActive ? "#1f2937" : "#e2e8f0";

  return (
    <div className="relative h-24 w-full overflow-hidden rounded-lg border border-gray-200">
      <svg viewBox="0 0 100 60" className="h-full w-full">
        <rect x="0" y="0" width="100" height="60" rx="6" fill={background} />
        <rect x="3" y="3" width="94" height="54" rx="6" fill="none" stroke={outline} />
        {shapes.map((shape, index) => (
          <rect
            key={`${type}-shape-${index}`}
            x={shape.x}
            y={shape.y}
            width={shape.w}
            height={shape.h}
            rx="2"
            fill={shape.variant ? island : counter}
          />
        ))}
      </svg>
      <div
        className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] ${
          isActive ? "bg-white/10 text-white/70" : "bg-slate-200 text-slate-500"
        }`}
      >
        Vista superior
      </div>
    </div>
  );
}

export default function KitchenStudio({ modules, isAuthenticated, isRoot }: KitchenStudioProps) {
  const [priceTier, setPriceTier] = useState<KitchenPriceTier | null>(null);
  const [layoutType, setLayoutType] = useState<KitchenLayoutType | null>(null);
  const [activeProductId, setActiveProductId] = useState<string>(modules[0]?.id || "");
  const [selectedModules, setSelectedModules] = useState<SelectedModule[]>([]);
  const [wallInputs, setWallInputs] = useState<Record<string, { widthMm: string; heightMm: string }>>({});
  const [spaceDimensions, setSpaceDimensions] = useState({
    widthMm: "",
    lengthMm: "",
    heightMm: "",
  });
  const [placedModules, setPlacedModules] = useState<PlacedModule[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const planRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [planSize, setPlanSize] = useState({ width: 0, height: 0 });

  const activeProduct = useMemo(
    () => modules.find((item) => item.id === activeProductId) || modules[0] || null,
    [modules, activeProductId],
  );

  const groupedModules = useMemo(() => {
    const grouped: Record<string, KitchenModuleProduct[]> = {};
    for (const item of modules) {
      const categoryKey = String(item.kitchenCategory || "OTHER");
      const section = CATEGORY_LABELS[categoryKey];
      if (!section) continue;
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(item);
    }
    return grouped;
  }, [modules]);

  const layoutFields = layoutType ? LAYOUT_FIELDS[layoutType] : [];
  const spaceWidthMm = Number(spaceDimensions.widthMm) || 0;
  const spaceLengthMm = Number(spaceDimensions.lengthMm) || 0;
  const spaceHeightMm = Number(spaceDimensions.heightMm) || 0;
  const isPlanReady = spaceWidthMm > 0 && spaceLengthMm > 0 && spaceHeightMm > 0;

  const totalBudget = selectedModules.reduce(
    (sum, item) => sum + item.unitPriceUsd * item.quantity,
    0,
  );

  useEffect(() => {
    if (!priceTier) return;
    setSelectedModules((prev) =>
      prev.map((item) => {
        const product = modules.find((mod) => mod.id === item.productId);
        if (!product) return item;
        return {
          ...item,
          unitPriceUsd: resolveTierPrice(product, priceTier),
        };
      }),
    );
  }, [priceTier, modules]);

  useEffect(() => {
    if (!planRef.current) return;
    const node = planRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPlanSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleSelectLayout = (value: KitchenLayoutType) => {
    setLayoutType(value);
    const nextWalls: Record<string, { widthMm: string; heightMm: string }> = {};
    for (const field of LAYOUT_FIELDS[value]) {
      nextWalls[field.wallName] = { widthMm: "", heightMm: "" };
    }
    setWallInputs(nextWalls);
  };

  const handleAddModule = (product: KitchenModuleProduct) => {
    if (!priceTier) return;
    const unitPrice = resolveTierPrice(product, priceTier);
    const widthMm = resolveWidthMm(product);
    setSelectedModules((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          widthMm,
          unitPriceUsd: unitPrice,
          quantity: 1,
        },
      ];
    });
  };

  const handleAddToPlan = (product: KitchenModuleProduct) => {
    if (!isPlanReady) return;
    const widthMm = resolveWidthMm(product);
    const depthMm = resolveDepthMm(product);
    const zone = resolvePlacementZone(product);
    setPlacedModules((prev) => [
      ...prev,
      {
        id: createPlacedId(product.id),
        productId: product.id,
        name: product.name,
        widthMm,
        depthMm,
        zone,
        positionX: 0,
        positionY: 0,
        mountHeightMm: zone === "WALL" ? WALL_MOUNT_HEIGHT_MM : 0,
      },
    ]);
  };

  const handleRemovePlacedModule = (id: string) => {
    setPlacedModules((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMovePlacedModule = (id: string, nextX: number, nextY: number) => {
    setPlacedModules((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const maxX = Math.max(0, spaceWidthMm - item.widthMm);
        const maxY = Math.max(0, spaceLengthMm - item.depthMm);
        const clampedX = Math.min(Math.max(nextX, 0), maxX);
        const clampedY = item.zone === "WALL" ? 0 : Math.min(Math.max(nextY, 0), maxY);
        return { ...item, positionX: clampedX, positionY: clampedY };
      }),
    );
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>, item: PlacedModule) => {
    if (!isPlanReady || planScale <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(item.id);
    dragStateRef.current = {
      id: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: item.positionX,
      originY: item.positionY,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>, item: PlacedModule) => {
    if (!dragStateRef.current || draggingId !== item.id || planScale <= 0) return;
    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;
    const nextX = dragStateRef.current.originX + deltaX / planScale;
    const nextY = dragStateRef.current.originY + deltaY / planScale;
    handleMovePlacedModule(item.id, nextX, nextY);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>, item: PlacedModule) => {
    if (!dragStateRef.current || draggingId !== item.id) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingId(null);
    dragStateRef.current = null;
  };

  const handleRemoveModule = (productId: string) => {
    setSelectedModules((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleSaveDesign = async () => {
    if (!priceTier) {
      setSaveMessage("Selecciona una gama antes de guardar.");
      return;
    }
    if (!layoutType) {
      setSaveMessage("Selecciona un tipo de cocina antes de guardar.");
      return;
    }
    if (!isAuthenticated) {
      window.location.href = `/auth/login?callbackUrl=/crea-tu-cocina`;
      return;
    }
    if (!selectedModules.length) {
      setSaveMessage("Agrega al menos un modulo para guardar el presupuesto.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      const layoutLabel = LAYOUT_OPTIONS.find((l) => l.value === layoutType)?.label || "Cocina";
      const dateTag = new Date().toISOString().slice(0, 10);
      const name = `${layoutLabel} ${dateTag}`;
      const saveRes = await fetch("/api/kitchen-designs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          layoutType,
          status: "SAVED",
          priceTier,
          totalPriceUsd: totalBudget,
          plan: { layoutType, priceTier },
          budget: { total: totalBudget, priceTier },
        }),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        throw new Error(saveData?.message || saveData?.error || "No se pudo guardar.");
      }

      const kitchenId = String(saveData.id || "");
      if (!kitchenId) {
        throw new Error("No se pudo crear el diseno.");
      }

      if (layoutFields.length) {
        const walls = layoutFields.map((field) => ({
          wallName: field.wallName,
          widthMm: Number(wallInputs[field.wallName]?.widthMm || 0),
          heightMm: field.isSeparation ? null : Number(wallInputs[field.wallName]?.heightMm || 0),
        }));
        const invalidWall = walls.some(
          (wall) => !Number.isFinite(wall.widthMm) || wall.widthMm <= 0,
        );
        const invalidHeight = walls.some(
          (wall) => wall.wallName !== "SEPARATION" && (!Number.isFinite(wall.heightMm || 0) || (wall.heightMm || 0) <= 0),
        );
        if (invalidWall || invalidHeight) {
          setSaveMessage("Completa las medidas del espacio antes de guardar.");
          setSaving(false);
          return;
        }
        await fetch("/api/kitchen-designs/space/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kitchenId, layoutType, walls }),
        });
      }

      let positionX = 0;
      for (const item of selectedModules) {
        for (let i = 0; i < item.quantity; i += 1) {
          await fetch("/api/kitchen-designs/modules/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kitchenId,
              productId: item.productId,
              positionX,
              positionY: 0,
              widthMm: item.widthMm,
              priceTier,
            }),
          });
          positionX += item.widthMm;
        }
      }

      setSaveMessage("Diseno guardado en tu panel de cliente.");
    } catch (error: any) {
      setSaveMessage(error?.message || "No se pudo guardar el diseno.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrintBudget = () => {
    if (!isAuthenticated) {
      window.location.href = `/auth/login?callbackUrl=/crea-tu-cocina`;
      return;
    }
    setSaveMessage("La impresion del presupuesto se habilitara en la siguiente fase.");
  };

  const handleUploadModel = async (file: File | null) => {
    if (!activeProduct || !file) return;
    setUploading(true);
    setUploadMessage(null);
    try {
      const formData = new FormData();
      formData.append("productId", activeProduct.id);
      formData.append("file", file);
      const res = await fetch("/api/3d/upload-skp", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo subir.");
      }
      setUploadMessage("Archivo recibido. Conversion en cola.");
    } catch (error: any) {
      setUploadMessage(error?.message || "No se pudo subir.");
    } finally {
      setUploading(false);
    }
  };

  const planScale = useMemo(() => {
    if (!isPlanReady || planSize.width === 0 || planSize.height === 0) return 0;
    return Math.min(planSize.width / spaceWidthMm, planSize.height / spaceLengthMm);
  }, [isPlanReady, planSize.height, planSize.width, spaceLengthMm, spaceWidthMm]);

  const layoutGuides = layoutType ? LAYOUT_SHAPES[layoutType] || [] : [];

  const planWidthPx = planScale > 0 ? spaceWidthMm * planScale : planSize.width;
  const planHeightPx = planScale > 0 ? spaceLengthMm * planScale : planSize.height;
  const wallStripPx = Math.max(10, Math.min(28, planHeightPx * 0.14));

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Paso 1: Selecciona la gama</h2>
            <p className="text-sm text-gray-600">
              El presupuesto se calcula con la gama seleccionada.
            </p>
          </div>
          {priceTier && (
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
              Gama activa: {PRICE_TIERS.find((tier) => tier.value === priceTier)?.label}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PRICE_TIERS.map((tier) => (
            <button
              key={tier.value}
              type="button"
              onClick={() => setPriceTier(tier.value)}
              className={`rounded-lg border px-4 py-3 text-left transition ${
                priceTier === tier.value
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-gray-50 text-gray-800 hover:border-gray-400"
              }`}
            >
              <div className="text-sm font-semibold">{tier.label}</div>
              <div className={`text-xs ${priceTier === tier.value ? "text-gray-200" : "text-gray-500"}`}>
                {tier.description}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Paso 2: Tipo de cocina</h2>
          <p className="text-sm text-gray-600">Elige el layout base para empezar el diseno.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {LAYOUT_OPTIONS.map((layout) => (
            <button
              key={layout.value}
              type="button"
              onClick={() => handleSelectLayout(layout.value)}
              className={`rounded-lg border p-3 text-left transition ${
                layoutType === layout.value
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white hover:border-gray-400"
              }`}
            >
              <LayoutPreview type={layout.value} isActive={layoutType === layout.value} />
              <div className="mt-3">
                <div className="text-sm font-semibold">{layout.label}</div>
                <div className={`text-xs ${layoutType === layout.value ? "text-gray-200" : "text-gray-500"}`}>
                  {layout.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Paso 3: Medidas del espacio</h2>
          <p className="text-sm text-gray-600">
            Ingresa las medidas base para definir el area de trabajo.
          </p>
        </div>
        {!layoutType && (
          <div className="text-sm text-gray-500">
            Selecciona un tipo de cocina para ver las opciones de medidas.
          </div>
        )}
        {layoutType && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs font-semibold text-gray-700">Medidas del ambiente</div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Ancho (mm)"
                  value={spaceDimensions.widthMm}
                  onChange={(event) =>
                    setSpaceDimensions((prev) => ({ ...prev, widthMm: event.target.value }))
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Largo (mm)"
                  value={spaceDimensions.lengthMm}
                  onChange={(event) =>
                    setSpaceDimensions((prev) => ({ ...prev, lengthMm: event.target.value }))
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Alto (mm)"
                  value={spaceDimensions.heightMm}
                  onChange={(event) =>
                    setSpaceDimensions((prev) => ({ ...prev, heightMm: event.target.value }))
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                Se usa esta medida para el plano y el montaje de muebles altos.
              </div>
            </div>
            {layoutFields.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {layoutFields.map((field) => (
                  <div key={field.wallName} className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs font-semibold text-gray-700">{field.label}</div>
                    <div className="mt-2 space-y-2">
                      <input
                        type="number"
                        min={0}
                        placeholder="Ancho (mm)"
                        value={wallInputs[field.wallName]?.widthMm || ""}
                        onChange={(event) =>
                          setWallInputs((prev) => ({
                            ...prev,
                            [field.wallName]: {
                              ...prev[field.wallName],
                              widthMm: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      {!field.isSeparation && (
                        <input
                          type="number"
                          min={0}
                          placeholder="Alto (mm)"
                          value={wallInputs[field.wallName]?.heightMm || ""}
                          onChange={(event) =>
                            setWallInputs((prev) => ({
                              ...prev,
                              [field.wallName]: {
                                ...prev[field.wallName],
                                heightMm: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-500">
                Para espacio libre podras definir medidas avanzadas en una fase posterior.
              </div>
            )}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Area de diseno</h2>
            <p className="text-sm text-gray-600">
              Visualiza el modulo activo y agrega muebles a tu proyecto.
            </p>
          </div>
          {activeProduct && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              Modulo activo: {activeProduct.name}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Plano 2D</div>
                  <div className="text-sm font-semibold text-gray-900">Distribucion en planta</div>
                  <div className="text-xs text-gray-500">
                    Arrastra los muebles. Los altos se montan en pared a 1500 mm.
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {isPlanReady
                    ? `Ancho ${spaceWidthMm} mm · Largo ${spaceLengthMm} mm · Alto ${spaceHeightMm} mm`
                    : "Completa ancho, largo y alto para activar el plano."}
                </div>
              </div>

              <div
                ref={planRef}
                className="relative mt-3 h-[360px] w-full overflow-hidden rounded-lg border border-dashed border-gray-300 bg-slate-50"
              >
                {isPlanReady ? (
                  <div className="absolute inset-3 flex items-center justify-center">
                    <div
                      className="relative rounded-md border border-slate-300 bg-white shadow-inner"
                      style={{ width: planWidthPx, height: planHeightPx }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage:
                            "linear-gradient(0deg, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.15) 1px, transparent 1px)",
                          backgroundSize: "24px 24px",
                        }}
                      />
                      <div
                        className="absolute left-0 top-0 w-full border-b border-slate-200 bg-slate-100/80"
                        style={{ height: wallStripPx }}
                      />
                      <div className="absolute left-2 top-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Pared 1500 mm
                      </div>

                      {layoutGuides.map((shape, index) => (
                        <div
                          key={`guide-${layoutType}-${index}`}
                          className="absolute rounded bg-slate-200/70"
                          style={{
                            left: `${shape.x}%`,
                            top: `${shape.y}%`,
                            width: `${shape.w}%`,
                            height: `${shape.h}%`,
                          }}
                        />
                      ))}

                      {placedModules.map((item) => {
                        const leftPx = item.positionX * planScale;
                        const topPx = item.positionY * planScale;
                        const widthPx = item.widthMm * planScale;
                        const depthPx = item.depthMm * planScale;
                        const isWall = item.zone === "WALL";
                        return (
                          <div
                            key={item.id}
                            onPointerDown={(event) => handlePointerDown(event, item)}
                            onPointerMove={(event) => handlePointerMove(event, item)}
                            onPointerUp={(event) => handlePointerUp(event, item)}
                            className={`absolute flex items-center justify-between gap-1 overflow-hidden rounded border px-1 text-[10px] font-semibold ${
                              isWall
                                ? "border-amber-300 bg-amber-100 text-amber-900"
                                : "border-emerald-300 bg-emerald-100 text-emerald-900"
                            } ${draggingId === item.id ? "ring-2 ring-slate-900" : ""}`}
                            style={{
                              left: leftPx,
                              top: isWall ? 0 : topPx,
                              width: Math.max(widthPx, 18),
                              height: Math.max(depthPx, 18),
                              cursor: "grab",
                            }}
                          >
                            <span className="truncate" title={item.name}>
                              {item.name}
                            </span>
                            <button
                              type="button"
                              className="text-[10px] text-slate-500 hover:text-slate-700"
                              onClick={() => handleRemovePlacedModule(item.id)}
                            >
                              x
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                    Define las medidas del ambiente para habilitar el plano.
                  </div>
                )}
              </div>

              {placedModules.length === 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  Usa "Agregar al plano" para colocar muebles y arrastrarlos.
                </div>
              )}
            </div>

            {activeProduct && (
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-gray-400">Modulo activo</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{activeProduct.name}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>SKU: {activeProduct.sku || activeProduct.code || "--"}</div>
                  <div>
                    Gama:{" "}
                    {priceTier
                      ? PRICE_TIERS.find((tier) => tier.value === priceTier)?.label
                      : "Sin seleccionar"}
                  </div>
                  <div>
                    Medidas: {resolveWidthMm(activeProduct)} x{" "}
                    {activeProduct.heightMm || "--"} x {activeProduct.depthMm || "--"} mm
                  </div>
                  <div>
                    Precio:{" "}
                    {priceTier ? formatMoney(resolveTierPrice(activeProduct, priceTier)) : "--"}
                  </div>
                </div>
              </div>
            )}
            {activeProduct ? (
                <CarpihogarModelViewer
                  productId={activeProduct.id}
                  productName={activeProduct.name}
                  sku={activeProduct.sku || activeProduct.code || null}
                  category={resolveCategoryLabel(activeProduct)}
                  furnitureType="Modulo de cocina"
                  widthCm={activeProduct.widthMm ? activeProduct.widthMm / 10 : null}
                  heightCm={activeProduct.heightMm ? activeProduct.heightMm / 10 : null}
                  depthCm={activeProduct.depthMm ? activeProduct.depthMm / 10 : null}
                  isAdmin={isRoot}
                showPanel={false}
                viewerClassName="w-full h-[520px] rounded-lg overflow-hidden"
              />
            ) : (
              <div className="h-[520px] rounded-lg border border-dashed border-gray-300 bg-gray-100/60 flex items-center justify-center text-sm text-gray-500">
                No hay modulos cargados.
              </div>
            )}
            {isRoot && activeProduct && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                <div className="font-semibold text-gray-900">Subir modelo 3D (solo root)</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="file"
                      accept=".skp"
                      onChange={(event) => handleUploadModel(event.target.files?.[0] || null)}
                      disabled={uploading}
                    />
                  </label>
                  {uploading && <span>Subiendo...</span>}
                </div>
                {uploadMessage && <div className="mt-1 text-xs text-gray-600">{uploadMessage}</div>}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {CATEGORY_ORDER.map((section) => {
              const items = groupedModules[section] || [];
              if (!items.length) return null;
              return (
                <div key={section} className="space-y-2">
                  <div className="text-sm font-semibold text-gray-900">{section}</div>
                  <div className="space-y-2">
                    {items.map((item) => {
                      const price = priceTier ? resolveTierPrice(item, priceTier) : 0;
                      const widthLabel = resolveWidthMm(item);
                      return (
                        <div
                          key={item.id}
                          className={`rounded-lg border p-3 transition ${
                            activeProductId === item.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setActiveProductId(item.id)}
                              className="text-left"
                            >
                              <div className="text-sm font-semibold">{item.name}</div>
                              <div
                                className={`text-xs ${
                                  activeProductId === item.id ? "text-gray-200" : "text-gray-500"
                                }`}
                              >
                                Ancho base: {widthLabel} mm
                              </div>
                            </button>
                            <div className="text-sm font-semibold">
                              {priceTier ? formatMoney(price) : "--"}
                            </div>
                          </div>
                          {!priceTier && (
                            <div className="mt-2 text-xs text-gray-500">
                              Selecciona una gama para ver precios y agregar este modulo.
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={`rounded px-3 py-1 text-xs font-semibold ${
                                priceTier
                                  ? "bg-gray-900 text-white"
                                  : "bg-gray-200 text-gray-500 cursor-not-allowed"
                              }`}
                              onClick={() => handleAddModule(item)}
                              disabled={!priceTier}
                            >
                              Agregar al presupuesto
                            </button>
                            <button
                              type="button"
                              className={`rounded px-3 py-1 text-xs font-semibold border ${
                                isPlanReady
                                  ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                  : "border-gray-200 text-gray-400 cursor-not-allowed"
                              }`}
                              onClick={() => handleAddToPlan(item)}
                              disabled={!isPlanReady}
                            >
                              Agregar al plano
                            </button>
                            <button
                              type="button"
                              className={`rounded px-3 py-1 text-xs font-semibold border ${
                                activeProductId === item.id
                                  ? "border-white/60 text-white"
                                  : "border-gray-300 text-gray-700"
                              }`}
                              onClick={() => setActiveProductId(item.id)}
                            >
                              Ver en visor 3D
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Presupuesto en tiempo real</h2>
            <p className="text-sm text-gray-600">
              Lista de modulos seleccionados y total estimado.
            </p>
          </div>
          <div className="text-xs text-gray-500 space-x-3">
            <span>Total: {formatMoney(totalBudget)}</span>
            <span>
              Gama:{" "}
              {priceTier
                ? PRICE_TIERS.find((tier) => tier.value === priceTier)?.label
                : "Sin seleccionar"}
            </span>
          </div>
        </div>

        {selectedModules.length === 0 ? (
          <div className="text-sm text-gray-500">
            Aun no has agregado modulos al presupuesto.
          </div>
        ) : (
          <div className="space-y-2">
            {selectedModules.map((item) => (
              <div
                key={item.productId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-500">
                    {item.quantity} x {formatMoney(item.unitPriceUsd)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">
                    {formatMoney(item.unitPriceUsd * item.quantity)}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-600 underline"
                    onClick={() => handleRemoveModule(item.productId)}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-gray-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            onClick={handleSaveDesign}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar presupuesto"}
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700"
            onClick={handlePrintBudget}
          >
            Imprimir presupuesto
          </button>
          {!isAuthenticated && (
            <a
              href="/auth/login?callbackUrl=/crea-tu-cocina"
              className="rounded border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700"
            >
              Iniciar sesion para guardar
            </a>
          )}
        </div>
        {saveMessage && <div className="text-xs text-gray-600">{saveMessage}</div>}
      </section>
    </div>
  );
}
