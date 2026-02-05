"use client";

import { useEffect, useMemo, useState } from "react";
import { venezuelaStates } from "@/lib/venezuela-regions";

type Props = {
  stateName?: string;
  cityName?: string;
  addressName?: string;
  defaultState?: string;
  defaultCity?: string;
  defaultAddress?: string;
};

export default function CarpentryClientLocationFields({
  stateName = "clientState",
  cityName = "clientCity",
  addressName = "clientAddress",
  defaultState = "",
  defaultCity = "",
  defaultAddress = "",
}: Props) {
  const [stateValue, setStateValue] = useState(defaultState);
  const [cityValue, setCityValue] = useState(defaultCity);

  const stateOptions = useMemo(() => {
    // Keep a stable order for UX.
    return [...venezuelaStates].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const cityOptions = useMemo(() => {
    const match = stateOptions.find(
      (s) => s.name.toLowerCase() === stateValue.toLowerCase(),
    );
    return match ? match.cities : [];
  }, [stateOptions, stateValue]);

  useEffect(() => {
    if (!cityValue) return;
    if (cityOptions.length && !cityOptions.includes(cityValue)) {
      setCityValue("");
    }
  }, [cityOptions, cityValue]);

  return (
    <>
      <div>
        <label className="block text-sm font-semibold text-gray-700">Estado</label>
        <select
          name={stateName}
          value={stateValue}
          onChange={(e) => setStateValue(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        >
          <option value="">Selecciona un estado</option>
          {stateOptions.map((state) => (
            <option key={state.name} value={state.name}>
              {state.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700">Ciudad</label>
        <select
          name={cityName}
          value={cityValue}
          onChange={(e) => setCityValue(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          disabled={!stateValue}
        >
          <option value="">{stateValue ? "Selecciona una ciudad" : "Selecciona un estado primero"}</option>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700">Dirección</label>
        <input
          name={addressName}
          defaultValue={defaultAddress}
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </div>
    </>
  );
}

