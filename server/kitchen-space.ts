export type KitchenLayoutType =
  | "LINEAL"
  | "L_SHAPE"
  | "DOUBLE_LINE"
  | "LINEAL_WITH_ISLAND"
  | "L_WITH_ISLAND"
  | "L_WITH_PENINSULA"
  | "CUSTOM_SPACE";

type WallDefinition = {
  wallName: string;
  label: string;
  isSeparation?: boolean;
};

type WallInput = {
  wallName?: string | null;
  widthMm?: number | string | null;
  heightMm?: number | string | null;
};

export const KITCHEN_LAYOUT_FIELDS: Record<KitchenLayoutType, WallDefinition[]> = {
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

export const SPACE_RANGES_MM = {
  widthMin: 300,
  widthMax: 20000,
  heightMin: 2000,
  heightMax: 4000,
};

const toNumber = (value: any) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeWallName = (value: any) => String(value || "").trim().toUpperCase();

export function validateKitchenSpaceInput(args: {
  layoutType: KitchenLayoutType;
  walls: WallInput[];
}) {
  const { layoutType, walls } = args;
  const defs = KITCHEN_LAYOUT_FIELDS[layoutType] || [];
  const allowedNames = new Set(defs.map((d) => d.wallName));
  const requiredNames = layoutType === "CUSTOM_SPACE" ? [] : defs.map((d) => d.wallName);
  const defByName = new Map(defs.map((d) => [d.wallName, d]));

  const errors: string[] = [];
  const rows: Array<{ wallName: string; widthMm: number; heightMm: number | null }> = [];
  const seen = new Set<string>();

  for (const wall of walls || []) {
    const wallName = normalizeWallName(wall?.wallName);
    if (!wallName) continue;
    if (layoutType !== "CUSTOM_SPACE" && !allowedNames.has(wallName)) {
      errors.push(`Wall "${wallName}" no es valido para ${layoutType}.`);
      continue;
    }
    if (seen.has(wallName)) continue;

    const widthMm = toNumber(wall?.widthMm);
    if (widthMm == null) {
      errors.push(`Wall "${wallName}" requiere widthMm.`);
      continue;
    }
    if (widthMm < SPACE_RANGES_MM.widthMin || widthMm > SPACE_RANGES_MM.widthMax) {
      errors.push(
        `Wall "${wallName}" widthMm fuera de rango (${SPACE_RANGES_MM.widthMin}-${SPACE_RANGES_MM.widthMax}).`,
      );
      continue;
    }

    const def = defByName.get(wallName);
    let heightMm = toNumber(wall?.heightMm);
    if (def?.isSeparation) {
      heightMm = null;
    } else if (heightMm != null) {
      if (heightMm < SPACE_RANGES_MM.heightMin || heightMm > SPACE_RANGES_MM.heightMax) {
        errors.push(
          `Wall "${wallName}" heightMm fuera de rango (${SPACE_RANGES_MM.heightMin}-${SPACE_RANGES_MM.heightMax}).`,
        );
        continue;
      }
    }

    rows.push({ wallName, widthMm, heightMm: heightMm ?? null });
    seen.add(wallName);
  }

  for (const requiredName of requiredNames) {
    if (!seen.has(requiredName)) {
      errors.push(`Wall "${requiredName}" es obligatorio para ${layoutType}.`);
    }
  }

  return { rows, errors };
}
