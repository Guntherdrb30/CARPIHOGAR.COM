"use client";

import { useEffect, useState } from "react";

type ConsentValue = "necessary" | "all" | null;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

export default function CookieSettingsPage() {
  const [consent, setConsent] = useState<ConsentValue>(null);

  useEffect(() => {
    const current = (readCookie("cookie_consent") as ConsentValue) ?? null;
    setConsent(current);
  }, []);

  const updateConsent = (value: ConsentValue) => {
    if (!value) {
      setCookie("cookie_consent", "", 0);
      setConsent(null);
      return;
    }
    setCookie("cookie_consent", value, 60 * 60 * 24 * 180);
    setConsent(value);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Privacy & Cookie Setting</h1>
      <p className="mt-4 text-gray-700">
        Puedes elegir el tipo de cookies que autorizas en carpihogar.com.
      </p>
      <div className="mt-6 space-y-3 text-sm text-gray-700">
        <div>
          <span className="font-medium">Estado actual:</span>{" "}
          {consent === "all" ? "Aceptadas todas" : consent === "necessary" ? "Solo necesarias" : "Sin seleccion"}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateConsent("necessary")}
            className="rounded border px-3 py-1"
          >
            Solo necesarias
          </button>
          <button
            type="button"
            onClick={() => updateConsent("all")}
            className="rounded bg-green-600 text-white px-3 py-1"
          >
            Aceptar todas
          </button>
          <button
            type="button"
            onClick={() => updateConsent(null)}
            className="rounded border px-3 py-1"
          >
            Borrar seleccion
          </button>
        </div>
      </div>
    </div>
  );
}
