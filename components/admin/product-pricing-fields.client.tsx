"use client";

import { useMemo, useState } from "react";

type ProductPricingFieldsProps = {
  basePriceUsd?: number | null;
  priceUSD?: number | null;
  priceAllyUSD?: number | null;
  priceWholesaleUSD?: number | null;
  marginClientPct?: number | null;
  marginAllyPct?: number | null;
  marginWholesalePct?: number | null;
  canEdit?: boolean;
  inputClassName?: string;
  labelClassName?: string;
  requiredBase?: boolean;
  requiredClientPrice?: boolean;
};

function toNumber(value: number | string | null | undefined) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeMarginPct(
  margin: number | null,
  base: number | null,
  price: number | null,
) {
  if (margin != null && Number.isFinite(margin)) return margin;
  if (base != null && base > 0 && price != null && Number.isFinite(price)) {
    return ((price / base) - 1) * 100;
  }
  return 0;
}

function computePrice(base: number | null, marginPct: number | null) {
  if (base == null || !Number.isFinite(base)) return null;
  const pct = marginPct != null && Number.isFinite(marginPct) ? marginPct : 0;
  return Number((base * (1 + pct / 100)).toFixed(2));
}

export default function ProductPricingFields({
  basePriceUsd,
  priceUSD,
  priceAllyUSD,
  priceWholesaleUSD,
  marginClientPct,
  marginAllyPct,
  marginWholesalePct,
  canEdit = true,
  inputClassName = "form-input",
  labelClassName = "block text-sm text-gray-700 mb-1",
  requiredBase = false,
  requiredClientPrice = false,
}: ProductPricingFieldsProps) {
  const baseFromProps = toNumber(basePriceUsd);
  const initialBase =
    baseFromProps != null && baseFromProps > 0 ? baseFromProps : toNumber(priceUSD);
  const initialMarginClient = computeMarginPct(
    toNumber(marginClientPct),
    initialBase,
    toNumber(priceUSD),
  );
  const initialMarginAlly = computeMarginPct(
    toNumber(marginAllyPct),
    initialBase,
    toNumber(priceAllyUSD),
  );
  const initialMarginWholesale = computeMarginPct(
    toNumber(marginWholesalePct),
    initialBase,
    toNumber(priceWholesaleUSD),
  );

  const [baseValue, setBaseValue] = useState(
    initialBase != null ? String(initialBase) : "",
  );
  const [marginClientValue, setMarginClientValue] = useState(
    initialMarginClient != null ? String(initialMarginClient) : "0",
  );
  const [marginAllyValue, setMarginAllyValue] = useState(
    initialMarginAlly != null ? String(initialMarginAlly) : "0",
  );
  const [marginWholesaleValue, setMarginWholesaleValue] = useState(
    initialMarginWholesale != null ? String(initialMarginWholesale) : "0",
  );

  const baseNum = useMemo(() => toNumber(baseValue), [baseValue]);
  const marginClientNum = useMemo(() => toNumber(marginClientValue), [marginClientValue]);
  const marginAllyNum = useMemo(() => toNumber(marginAllyValue), [marginAllyValue]);
  const marginWholesaleNum = useMemo(() => toNumber(marginWholesaleValue), [marginWholesaleValue]);

  const clientPrice = useMemo(
    () => computePrice(baseNum, marginClientNum),
    [baseNum, marginClientNum],
  );
  const allyPrice = useMemo(
    () => computePrice(baseNum, marginAllyNum),
    [baseNum, marginAllyNum],
  );
  const wholesalePrice = useMemo(
    () => computePrice(baseNum, marginWholesaleNum),
    [baseNum, marginWholesaleNum],
  );

  return (
    <>
      <div>
        <label className={labelClassName}>Precio base (USD)</label>
        <input
          name="basePriceUsd"
          type="number"
          step="0.01"
          placeholder="Precio base"
          className={inputClassName}
          value={baseValue}
          onChange={(event) => setBaseValue(event.target.value)}
          readOnly={!canEdit}
          required={requiredBase}
        />
      </div>
      <div>
        <label className={labelClassName}>Porcentaje de ganancia Cliente (%)</label>
        <input
          name="marginClientPct"
          type="number"
          step="0.01"
          min="0"
          placeholder="Ganancia Cliente"
          className={inputClassName}
          value={marginClientValue}
          onChange={(event) => setMarginClientValue(event.target.value)}
          readOnly={!canEdit}
        />
      </div>
      <div>
        <label className={labelClassName}>Porcentaje de ganancia Aliado (%)</label>
        <input
          name="marginAllyPct"
          type="number"
          step="0.01"
          min="0"
          placeholder="Ganancia Aliado"
          className={inputClassName}
          value={marginAllyValue}
          onChange={(event) => setMarginAllyValue(event.target.value)}
          readOnly={!canEdit}
        />
      </div>
      <div>
        <label className={labelClassName}>Porcentaje de ganancia Mayorista (%)</label>
        <input
          name="marginWholesalePct"
          type="number"
          step="0.01"
          min="0"
          placeholder="Ganancia Mayorista"
          className={inputClassName}
          value={marginWholesaleValue}
          onChange={(event) => setMarginWholesaleValue(event.target.value)}
          readOnly={!canEdit}
        />
      </div>
      <div>
        <label className={labelClassName}>Precio Cliente (USD)</label>
        <input
          name="priceUSD"
          type="number"
          step="0.01"
          placeholder="Precio Cliente"
          className={inputClassName}
          value={clientPrice != null ? String(clientPrice) : ""}
          readOnly
          required={requiredClientPrice}
        />
      </div>
      <div>
        <label className={labelClassName}>Precio Aliado (USD)</label>
        <input
          name="priceAllyUSD"
          type="number"
          step="0.01"
          placeholder="Precio Aliado"
          className={inputClassName}
          value={allyPrice != null ? String(allyPrice) : ""}
          readOnly
        />
      </div>
      <div>
        <label className={labelClassName}>Precio Mayorista (USD)</label>
        <input
          name="priceWholesaleUSD"
          type="number"
          step="0.01"
          placeholder="Precio Mayorista"
          className={inputClassName}
          value={wholesalePrice != null ? String(wholesalePrice) : ""}
          readOnly
        />
      </div>
    </>
  );
}
