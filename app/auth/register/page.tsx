"use client";

import React, { useState } from "react";
import DeliveryImageUploader from "@/components/delivery/image-uploader";
import { signIn } from "next-auth/react";
import { normalizeVePhone } from "@/lib/phone";
import { venezuelaData } from "@/lib/venezuela-data";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isAlly, setIsAlly] = useState(false);
  const [isDelivery, setIsDelivery] = useState(false);
  const [deliveryCedula, setDeliveryCedula] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryVehicleType, setDeliveryVehicleType] = useState("MOTO");
  const [deliveryVehicleBrand, setDeliveryVehicleBrand] = useState("");
  const [deliveryVehicleModel, setDeliveryVehicleModel] = useState("");
  const [deliveryMotoPlate, setDeliveryMotoPlate] = useState("");
  const [deliveryChassisSerial, setDeliveryChassisSerial] = useState("");
  const [plateError, setPlateError] = useState<string>("");
  const [vinError, setVinError] = useState<string>("");
  const [deliveryIdImageUrl, setDeliveryIdImageUrl] = useState("");
  const [deliverySelfieUrl, setDeliverySelfieUrl] = useState("");
  const [agreeDelivery, setAgreeDelivery] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [resendOk, setResendOk] = useState<null | boolean>(null);
  const [uploadBusyCount, setUploadBusyCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [userType, setUserType] = useState<'CLIENT' | 'ALLY' | 'DELIVERY'>('CLIENT');
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");

  const handleUserTypeChange = (type: 'CLIENT' | 'ALLY' | 'DELIVERY') => {
    setUserType(type);
    setIsAlly(type === 'ALLY');
    setIsDelivery(type === 'DELIVERY');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const pwd = String(password || "").trim();
    if (!pwd || pwd.length < 8 || pwd.length > 16) {
      setError("La contrasena debe tener entre 8 y 16 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden");
      return;
    }

    if (isDelivery) {
      const normalized = normalizeVePhone(deliveryPhone);
      if (!normalized) {
        setError("Telefono invalido. Usa 0412-1234567 o +58 412 1234567");
        return;
      }
      if (!deliveryState || !deliveryCity || !deliveryAddress.trim()) {
        setError("Selecciona estado, ciudad y escribe tu direccion real completa.");
        return;
      }
      const normalizePlate = (v: string) => v.replace(/\s+/g, '').toUpperCase();
      const plate = normalizePlate(deliveryMotoPlate);
      const vin = deliveryChassisSerial.replace(/\s+/g, '').toUpperCase();
      const isMoto = deliveryVehicleType === 'MOTO';
      const plateOk = /^[A-Z0-9-]{5,8}$/.test(plate);
      const vinOk = isMoto ? vin.length >= 6 : /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
      setPlateError(plateOk ? "" : "Placa invalida (5-8 caracteres, letras/numeros)");
      setVinError(vinOk ? "" : (isMoto ? 'Serial de chasis invalido' : 'VIN invalido (17 caracteres, sin I/O/Q)'));
      if (
        !deliveryCedula.trim() ||
        !deliveryPhone.trim() ||
        !deliveryAddress.trim() ||
        !deliveryVehicleBrand.trim() ||
        !deliveryVehicleModel.trim() ||
        !plateOk ||
        !vinOk ||
        !deliveryIdImageUrl.trim() ||
        !deliverySelfieUrl.trim()
      ) {
        const msgs: string[] = [];
        if (!plateOk) msgs.push('Placa invalida (5-8 caracteres, letras/numeros)');
        if (!vinOk) msgs.push(isMoto ? 'Serial de chasis invalido' : 'VIN invalido (17 caracteres, sin I/O/Q)');
        setError(msgs.join(' | ') || "Para registrarte como Delivery, completa todos los campos y sube las imagenes requeridas.");
        return;
      }
      if (!agreeDelivery) {
        setError("Debes aceptar el Contrato de Servicio de Delivery.");
        return;
      }
    }

    setSubmitting(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        isAlly,
        isDelivery,
        deliveryCedula,
        deliveryPhone: normalizeVePhone(deliveryPhone) || deliveryPhone,
        deliveryAddress: deliveryState && deliveryCity
          ? `${deliveryState} / ${deliveryCity} / ${deliveryAddress}`
          : deliveryAddress,
        deliveryVehicleType,
        deliveryVehicleBrand,
        deliveryVehicleModel,
        deliveryMotoPlate,
        deliveryChassisSerial,
        deliveryIdImageUrl,
        deliverySelfieUrl,
        agreeDelivery,
      }),
    });

    if (response.ok) {
      setDone(true);
    } else {
      const data = await response.json().catch(() => ({} as any));
      setError((data as any)?.message || "Algo salio mal");
    }
    setSubmitting(false);
  };

  if (done) {
    return (
      <div className="flex justify-center items-center min-h-screen p-4">
        <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-lg space-y-4 text-center">
          <h1 className="text-2xl font-bold">Revisa tu correo</h1>
          <p className="text-gray-700">
            Enviamos un enlace de verificacion a <span className="font-semibold">{email}</span>. Debes verificar tu correo para activar tu cuenta.
          </p>
          <button
            type="button"
            onClick={async () => {
              setResendMsg("");
              setResendOk(null);
              try {
                const res = await fetch("/api/auth/resend-verification", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });
                if (res.ok) {
                  setResendOk(true);
                  setResendMsg("Te reenvioos el enlace si el email existe y no estaba verificado.");
                } else {
                  setResendOk(false);
                  setResendMsg("No se pudo reenvio. Intenta mas tarde.");
                }
              } catch {
                setResendOk(false);
                setResendMsg("Error reenviodo verificacion");
              }
            }}
            className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50"
          >
            reenvio verificacion
          </button>
          {resendMsg ? (
            <p className="text-xs" style={{ color: resendOk ? "#16a34a" : "#dc2626" }}>{resendMsg}</p>
          ) : null}
          <a href="/auth/login" className="inline-block mt-2 text-blue-600 underline">
            Ir a iniciar sesion
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen p-4">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md w-full max-w-lg space-y-4">
        <div className="flex flex-col items-center mb-1">
          <img src="/logo-default.svg" alt="Carpihogar" className="h-10 mb-2" />
          <h1 className="text-2xl font-bold">Registro</h1>
        </div>
        {error && <p className="text-red-500">{error}</p>}

        <div>
          <label className="block text-gray-700">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>

        <div>
          <label className="block text-gray-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>

        <div>
          <label className="block text-gray-700">contrasena</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg pr-10"
              minLength={8}
              maxLength={16}
              title="Entre 8 y 16 caracteres (letras, numeros o simbolos)"
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 cursor-pointer"
              onMouseDown={() => setShowPassword(true)}
              onMouseUp={() => setShowPassword(false)}
              onMouseLeave={() => setShowPassword(false)}
              onTouchStart={() => setShowPassword(true)}
              onTouchEnd={() => setShowPassword(false)}
              onTouchCancel={() => setShowPassword(false)}
              aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-gray-700">Confirmar contrasena</label>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg pr-10"
              minLength={8}
              maxLength={16}
              title="Repite la contrasena (entre 8 y 16 caracteres)"
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 cursor-pointer"
              onMouseDown={() => setShowConfirmPassword(true)}
              onMouseUp={() => setShowConfirmPassword(false)}
              onMouseLeave={() => setShowConfirmPassword(false)}
              onTouchStart={() => setShowConfirmPassword(true)}
              onTouchEnd={() => setShowConfirmPassword(false)}
              onTouchCancel={() => setShowConfirmPassword(false)}
              aria-label={showConfirmPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-800">
            ¿Cómo quieres usar Carpihogar?
          </p>
          <p className="text-xs text-gray-500">
            Elige una opción. Puedes registrarte solo como cliente o solicitar acceso como aliado o delivery.
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleUserTypeChange('CLIENT')}
              className={`w-full text-left border rounded-lg p-3 text-sm transition-colors ${
                userType === 'CLIENT'
                  ? 'border-brand bg-brand/5'
                  : 'border-gray-300 hover:border-brand/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">Cliente</span>
                <span
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    userType === 'CLIENT'
                      ? 'border-brand bg-brand'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {userType === 'CLIENT' && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                Compra para tu hogar o negocio sin requisitos adicionales.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleUserTypeChange('ALLY')}
              className={`w-full text-left border rounded-lg p-3 text-sm transition-colors ${
                userType === 'ALLY'
                  ? 'border-brand bg-brand/5'
                  : 'border-gray-300 hover:border-brand/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">
                  Arquitecto / Diseñador / Aliado
                </span>
                <span
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    userType === 'ALLY'
                      ? 'border-brand bg-brand'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {userType === 'ALLY' && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                Regístrate como profesional para acceder a beneficios y comisiones por proyectos de tus clientes.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleUserTypeChange('DELIVERY')}
              className={`w-full text-left border rounded-lg p-3 text-sm transition-colors ${
                userType === 'DELIVERY'
                  ? 'border-brand bg-brand/5'
                  : 'border-gray-300 hover:border-brand/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">
                  Delivery autorizado
                </span>
                <span
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    userType === 'DELIVERY'
                      ? 'border-brand bg-brand'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {userType === 'DELIVERY' && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                Solicita trabajar como repartidor oficial de Carpihogar. Te pediremos algunos datos y documentos de tu vehículo.
              </p>
            </button>
          </div>
        </div>

        {isDelivery && (
          <div className="space-y-4 border rounded p-4">
            <h2 className="text-lg font-semibold">Solicitud de Delivery</h2>
            <div>
              <label className="block text-gray-700">Cedula / ID</label>
              <input
                type="text"
                value={deliveryCedula}
                onChange={(e) => setDeliveryCedula(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700">Telefono de trabajo (WhatsApp)</label>
              <input
                type="tel"
                value={deliveryPhone}
                onChange={(e) => setDeliveryPhone(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="0412-1234567"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Este sera el telefono que usaras para las entregas y quedara registrado en tu perfil.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="block text-gray-700">Estado</label>
                <select
                  value={deliveryState}
                  onChange={(e) => {
                    setDeliveryState(e.target.value);
                    setDeliveryCity("");
                  }}
                  className="w-full rounded-lg border px-3 py-2"
                  required
                >
                  <option value="">Selecciona estado</option>
                  {venezuelaData.map((e) => (
                    <option key={e.estado} value={e.estado}>
                      {e.estado}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-700">Ciudad</label>
                <select
                  value={deliveryCity}
                  onChange={(e) => setDeliveryCity(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                  required
                  disabled={!deliveryState}
                >
                  <option value="">Selecciona ciudad</option>
                  {venezuelaData
                    .find((e) => e.estado === deliveryState)
                    ?.ciudades.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-gray-700">Direccion exacta</label>
              <textarea
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                rows={3}
                placeholder="Escribe tu direccion real (calle, casa/edificio, referencias)."
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Debe ser la direccion real donde resides o trabajas habitualmente. La usaremos para coordinar entregas y validar tu zona de servicio.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-gray-700">Tipo de vehiculo</label>
                <select
                  value={deliveryVehicleType}
                  onChange={(e) => setDeliveryVehicleType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                >
                  <option value="MOTO">Moto</option>
                  <option value="CARRO">Carro</option>
                  <option value="CAMIONETA">Camioneta</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700">Placa del vehiculo</label>
                <input
                  type="text"
                  value={deliveryMotoPlate}
                  onChange={(e) => { setPlateError(""); setDeliveryMotoPlate(e.target.value.replace(/\s+/g,'').toUpperCase()); }}
                  className={`w-full px-3 py-2 rounded-lg border ${plateError ? 'border-red-500' : 'border-gray-300'}`}
                  required
                  placeholder={deliveryVehicleType === 'MOTO' ? 'Ej: AB1C2D' : 'Ej: AB123CD'}
                  title="5-8 caracteres, letras y numeros"
                />
                <p className={`text-xs mt-1 ${plateError ? 'text-red-600' : 'text-gray-500'}`}>{plateError || (deliveryVehicleType === 'MOTO' ? 'Ejemplos: AB1C2D, A1B2C3' : 'Ejemplos: AB123CD, ABC12D')}</p>
              </div>
              <div>
                <label className="block text-gray-700">Serial del chasis / VIN</label>
                <input
                  type="text"
                  value={deliveryChassisSerial}
                  onChange={(e) => { setVinError(""); setDeliveryChassisSerial(e.target.value.toUpperCase()); }}
                  className={`w-full px-3 py-2 rounded-lg border ${vinError ? 'border-red-500' : 'border-gray-300'}`}
                  required
                  placeholder={deliveryVehicleType === 'MOTO' ? 'Serial de chasis' : 'VIN (17 caracteres)'}
                  title={deliveryVehicleType === 'MOTO' ? 'Ingrese el serial de chasis' : 'VIN de 17 caracteres (sin I, O, Q)'}
                />
                <p className={`text-xs mt-1 ${vinError ? 'text-red-600' : 'text-gray-500'}`}>{vinError || (deliveryVehicleType === 'MOTO' ? 'Ingresa el serial del chasis (moto)' : 'Ingresa el VIN de 17 caracteres (carro/camioneta)')}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-700">Marca</label>
                <input
                  type="text"
                  value={deliveryVehicleBrand}
                  onChange={(e) => setDeliveryVehicleBrand(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder={
                    deliveryVehicleType === 'MOTO' ? 'Ej: Honda, Yamaha, Suzuki' :
                    deliveryVehicleType === 'CARRO' ? 'Ej: Ford, Toyota, Chevrolet' :
                    'Ej: Toyota, Chevrolet, Ford'
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700">Modelo</label>
                <input
                  type="text"
                  value={deliveryVehicleModel}
                  onChange={(e) => setDeliveryVehicleModel(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder={
                    deliveryVehicleType === 'MOTO' ? 'Ej: CG150, AX100, DT125' :
                    deliveryVehicleType === 'CARRO' ? 'Ej: Fiesta, Corolla, Aveo' :
                    'Ej: Hilux, Silverado, Explorer'
                  }
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DeliveryImageUploader
                label="Foto cedula/ID"
                value={deliveryIdImageUrl}
                onChange={setDeliveryIdImageUrl}
                required
                onBusyChange={(b) => setUploadBusyCount((n) => (b ? n + 1 : Math.max(0, n - 1)))}
                hint="Foto frontal legible, sin reflejos. Formatos: PNG/JPG/WEBP."
              />
              <DeliveryImageUploader
                label="Selfie"
                value={deliverySelfieUrl}
                onChange={setDeliverySelfieUrl}
                required
                onBusyChange={(b) => setUploadBusyCount((n) => (b ? n + 1 : Math.max(0, n - 1)))}
                hint="Selfie sosteniendo tu cedula/ID, rostro visible."
              />
            </div>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={agreeDelivery} onChange={(e) => setAgreeDelivery(e.target.checked)} />
              <span className="text-gray-700">Acepto el Contrato de Servicio de Delivery.</span>
            </label>
          </div>
        )}

        {(() => {
          const disabled = submitting || uploadBusyCount > 0;
          const missingImages = isDelivery && (!deliveryIdImageUrl || !deliverySelfieUrl);
          return (
            <div className="space-y-2">
              {missingImages && (
                <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  Debes subir las dos imagenes requeridas (cedula/ID y selfie).
                </div>
              )}
              <button
                type="submit"
                disabled={disabled || missingImages}
                className={`w-full py-2 rounded-lg ${
                  disabled || missingImages
                    ? 'bg-blue-300 cursor-not-allowed text-white'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {submitting
                  ? 'Enviando...'
                  : uploadBusyCount > 0
                    ? 'Esperando imagenes...'
                    : 'Registrarme'}
              </button>
            </div>
          );
        })()}
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/auth/after-login" })}
          className="w-full mt-2 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
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
      </form>
    </div>
  );
}


