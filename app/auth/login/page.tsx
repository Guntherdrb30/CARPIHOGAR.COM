"use client";

import { useMemo, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resendMsg, setResendMsg] = useState("");
  const [resendOk, setResendOk] = useState<null | boolean>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(() => {
    try {
      return searchParams?.get("callbackUrl") || "";
    } catch {
      return "";
    }
  }, [searchParams]);
  const verifiedMsg = useMemo(() => {
    try {
      return (searchParams?.get("message") || "").toLowerCase() === "verified";
    } catch {
      return false;
    }
  }, [searchParams]);
  const verifyRequired = useMemo(() => {
    try {
      return (searchParams?.get("message") || "").toLowerCase() === "verify-required";
    } catch {
      return false;
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (result?.error) {
      setError(result.error);
    } else {
      const next = (callbackUrl || "").trim();
      const session = await getSession();
      const role = (session?.user as any)?.role as string | undefined;
      if (role === "ADMIN") {
        router.replace("/dashboard/admin");
        return;
      }
      if (next) {
        router.replace(next);
        return;
      }
      if (role === "DELIVERY") {
        router.replace("/dashboard/delivery");
      } else if (role === "ALIADO") {
        router.replace("/dashboard/aliado");
      } else {
        router.replace("/dashboard/cliente");
      }
    }
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm">
        <div className="flex flex-col items-center mb-4">
          <img src="/logo-default.svg" alt="Carpihogar" className="h-10 mb-2" />
          <h1 className="text-2xl font-bold">Iniciar sesion</h1>
        </div>
        {verifiedMsg ? (
          <div className="mb-4 rounded border border-green-300 bg-green-50 text-green-800 px-3 py-2 text-sm">
            Tu correo fue verificado. Ya puedes iniciar sesion.
          </div>
        ) : null}
        {verifyRequired ? (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
            Debes verificar tu correo para comprar o usar el panel. Si no recibiste el email, reenviarlo abajo.
          </div>
        ) : null}
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <div className="mb-4">
          <label className="block text-gray-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-700">Contrasena</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
        <button type="submit" className="w-full bg-blue-500 text-white py-2 rounded-lg">
          Ingresar
        </button>
        {resendMsg ? (
          <p className="text-xs mt-2" style={{ color: resendOk ? "#16a34a" : "#dc2626" }}>{resendMsg}</p>
        ) : null}
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/auth/after-login" })}
          className="w-full mt-3 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 48 48"
            className="h-5 w-5"
          >
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.5 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.6-.4-3.9z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4c-7.7 0-14.4 3.6-17.7 9.3z" />
            <path fill="#4CAF50" d="M24 44c5 0 9.6-1.9 13.1-5.1l-6-5.1C29 35.5 26.6 36.4 24 36c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.6 40.4 16.4 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-1.1 3-3.4 5.5-6.2 6.8l0 0 6 5.1C38.9 36.6 44 30.9 44 24c0-1.3-.1-2.6-.4-3.9z" />
          </svg>
          Continuar con Google
        </button>
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600">
            ?No tienes cuenta?{" "}
            <Link href="/auth/register" className="font-medium text-blue-600 hover:underline">
              Registrate
            </Link>
          </p>
          <p className="text-sm text-gray-600 mt-2">
            <Link href="/auth/forgot-password" className="font-medium text-blue-600 hover:underline">
              ?Olvidaste tu contrasena?
            </Link>
          </p>
          <p className="text-sm text-gray-600 mt-2">
            <Link href="/auth/forgot-username" className="font-medium text-blue-600 hover:underline">
              ?Olvidaste tu usuario?
            </Link>
          </p>
          <p className="text-sm text-gray-600 mt-3">?No recibiste el correo de verificacion?</p>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch("/api/auth/resend-verification", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });
                const ok = res.ok;
                if (ok) {
                  setResendOk(true);
                  setResendMsg("Te enviamos el enlace si el email existe y no estaba verificado.");
                } else {
                  setResendOk(false);
                  setResendMsg("No se pudo reenviar. Intenta mas tarde.");
                }
              } catch {
                setResendOk(false);
                setResendMsg("Error reenviando verificacion");
              }
            }}
            className="mt-2 w-full border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50"
          >
            Reenviar verificacion
          </button>
        </div>
      </form>
    </div>
  );
}
