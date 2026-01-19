"use client";
import { useEffect, useMemo, useState } from "react";
import {
  getAvailableVoices,
  getPreferredVoiceName,
  setPreferredVoiceName,
} from "./hooks/speech";

export default function VoiceSelector() {
  const [voices, setVoices] = useState<{ id: string; label: string }[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    setVoices(getAvailableVoices());
  }, []);

  useEffect(() => {
    setSelected(getPreferredVoiceName() || "");
  }, [voices.length]);

  const options = useMemo(() => {
    return [...voices].sort((a, b) => a.label.localeCompare(b.label));
  }, [voices]);

  return (
    <label className="text-xs flex items-center gap-2">
      <span className="text-gray-600">Voz</span>
      <select
        value={selected}
        onChange={(e) => {
          const v = e.target.value || "";
          setSelected(v);
          setPreferredVoiceName(v || null);
        }}
        className="border rounded px-2 py-1 text-xs bg-white max-w-[170px]"
        aria-label="Seleccionar voz"
      >
        <option value="">Auto</option>
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );
}
