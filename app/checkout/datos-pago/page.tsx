"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function DatosPagoPage() {
  type ShippingOption = '' | 'RETIRO_TIENDA' | 'DELIVERY';
  type ShippingCarrier = '' | 'TEALCA' | 'MRW';

  const [paymentMethod, setPaymentMethod] = useState<"PAGO_MOVIL" | "TRANSFERENCIA" | "ZELLE">("PAGO_MOVIL");
  const [paymentCurrency, setPaymentCurrency] = useState<"USD" | "VES">("USD");
  const [vesSalesDisabled, setVesSalesDisabled] = useState(false);
  const [shippingOption, setShippingOption] = useState<ShippingOption>('');
  const [shippingCarrier, setShippingCarrier] = useState<ShippingCarrier>('');
  const [detectedCity, setDetectedCity] = useState('');
  const [isLocalBarinas, setIsLocalBarinas] = useState(false);
  const [hasAddress, setHasAddress] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();

  // hydrate from localStorage and persist selections for next step
  useEffect(() => {
    try {
      const savedMethod = localStorage.getItem('checkout.paymentMethod') as any;
      const savedCurrency = localStorage.getItem('checkout.paymentCurrency') as any;
      const savedEntrega = localStorage.getItem('checkout.shippingOption') as any;
      const savedCarrier = localStorage.getItem('checkout.shippingCarrier') as any;
      if (savedMethod === 'PAGO_MOVIL' || savedMethod === 'TRANSFERENCIA' || savedMethod === 'ZELLE') {
        setPaymentMethod(savedMethod);
      }
      if (savedCurrency === 'USD' || savedCurrency === 'VES') {
        setPaymentCurrency(savedCurrency);
      }
      if (savedEntrega === 'RETIRO_TIENDA' || savedEntrega === 'DELIVERY' || savedEntrega === '') {
        setShippingOption(savedEntrega);
      }
      if (savedCarrier === 'TEALCA' || savedCarrier === 'MRW' || savedCarrier === '') {
        setShippingCarrier(savedCarrier);
      }
    } catch {}
  }, []);

  // Read from querystring if provided (?moneda=USD|VES, ?metodo=..., ?entrega=..., ?carrier=...)
  useEffect(() => {
    if (!searchParams) return;
    const qMoneda = (searchParams.get('moneda') || '').toUpperCase();
    if (qMoneda === 'USD' || (qMoneda === 'VES' && !vesSalesDisabled)) {
      setPaymentCurrency(qMoneda as any);
      try { localStorage.setItem('checkout.paymentCurrency', qMoneda); } catch {}
    }
    const qMetodo = (searchParams.get('metodo') || '').toUpperCase();
    if (qMetodo === 'PAGO_MOVIL' || qMetodo === 'TRANSFERENCIA' || qMetodo === 'ZELLE') {
      setPaymentMethod(qMetodo as any);
      try { localStorage.setItem('checkout.paymentMethod', qMetodo); } catch {}
    }
    const qEntrega = (searchParams.get('entrega') || '').toUpperCase();
    if (qEntrega === 'RETIRO_TIENDA' || qEntrega === 'DELIVERY' || qEntrega === '') {
      setShippingOption(qEntrega as ShippingOption);
      try { localStorage.setItem('checkout.shippingOption', qEntrega); } catch {}
    }
    const qCarrier = (searchParams.get('carrier') || '').toUpperCase();
    if (qCarrier === 'TEALCA' || qCarrier === 'MRW' || qCarrier === '') {
      setShippingCarrier(qCarrier as ShippingCarrier);
      try { localStorage.setItem('checkout.shippingCarrier', qCarrier); } catch {}
    }
  }, [searchParams, vesSalesDisabled]);

  // detect location
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/location', { credentials: 'include' });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setDetectedCity(json.city || '');
          setIsLocalBarinas(!!json.isBarinas);
          setHasAddress(!!json.hasAddress);
        }
      } catch {}
    })();
    return () => { cancelled = true };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/payment', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const disabled = Boolean(json?.vesSalesDisabled);
        setVesSalesDisabled(disabled);
        if (disabled) {
          setPaymentCurrency('USD');
          try { localStorage.setItem('checkout.paymentCurrency', 'USD'); } catch {}
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (vesSalesDisabled && paymentCurrency === 'VES') {
      setPaymentCurrency('USD');
      try { localStorage.setItem('checkout.paymentCurrency', 'USD'); } catch {}
    }
  }, [vesSalesDisabled, paymentCurrency]);

  // keep URL in sync when currency/entrega/carrier changes
  useEffect(() => {
    try {
      const params = new URLSearchParams(searchParams?.toString());
      if (paymentCurrency) params.set('moneda', paymentCurrency);
      if (shippingOption !== undefined) params.set('entrega', shippingOption);
      if (shippingCarrier !== undefined) params.set('carrier', shippingCarrier);
      const url = `${location.pathname}?${params.toString()}`;
      router.replace(url);
    } catch {}
  }, [paymentCurrency, shippingOption, shippingCarrier]);

  // keep URL in sync when method changes
  useEffect(() => {
    try {
      const params = new URLSearchParams(searchParams?.toString());
      if (paymentMethod) params.set('metodo', paymentMethod);
      const url = `${location.pathname}?${params.toString()}`;
      router.replace(url);
    } catch {}
  }, [paymentMethod]);

  // persist selections
  useEffect(() => {
    try { localStorage.setItem('checkout.paymentMethod', paymentMethod); } catch {}
  }, [paymentMethod]);
  useEffect(() => {
    try { localStorage.setItem('checkout.paymentCurrency', paymentCurrency); } catch {}
  }, [paymentCurrency]);
  useEffect(() => {
    try { localStorage.setItem('checkout.shippingOption', shippingOption); } catch {}
  }, [shippingOption]);
  useEffect(() => {
    try { localStorage.setItem('checkout.shippingCarrier', shippingCarrier); } catch {}
  }, [shippingCarrier]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Datos de Pago</h1>
      <div className="space-y-4">
        {!hasAddress && (
          <div className="bg-red-50 border-l-4 border-red-400 p-3 text-sm text-red-800 rounded">
            Aún no has agregado una dirección de envío. Completa tus datos en
            <a className="underline ml-1" href="/checkout/datos-envio">Datos de Envío</a>
            {" "}o en
            <a className="underline ml-1" href="/dashboard/cliente">Mi Cuenta</a>.
          </div>
        )}

        {isLocalBarinas ? (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 text-sm text-yellow-800 rounded">
            Detectamos ciudad {detectedCity || 'local'}. Puedes elegir Retiro en tienda o Delivery incluido.
          </div>
        ) : (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 text-sm text-blue-800 rounded">
            Para envíos nacionales, podrás elegir TEALCA o MRW en el siguiente paso.
          </div>
        )}
        <div>
          <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700">
            Método de pago
          </label>
          <select
            id="paymentMethod"
            name="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as any)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="PAGO_MOVIL">Pago Móvil</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="ZELLE">Zelle</option>
          </select>
        </div>

        <div>
          <label htmlFor="paymentCurrency" className="block text-sm font-medium text-gray-700">
            Moneda del pago
          </label>
          <select
            id="paymentCurrency"
            name="paymentCurrency"
            value={paymentCurrency}
            onChange={(e) => setPaymentCurrency(e.target.value as any)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="USD">USD</option>
            {!vesSalesDisabled && <option value="VES">Bs (VES)</option>}
          </select>
          {vesSalesDisabled && (
            <div className="text-xs text-gray-500 mt-1">Las ventas en bolívares están desactivadas.</div>
          )}
        </div>

        {paymentMethod === "PAGO_MOVIL" && (
          <div>
            <label htmlFor="pm_phone" className="block text-sm font-medium text-gray-700">Teléfono</label>
            <input type="text" id="pm_phone" name="pm_phone" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
            <label htmlFor="reference" className="block text-sm font-medium text-gray-700 mt-4">Referencia</label>
            <input type="text" id="reference" name="reference" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
        )}

        {paymentMethod === "TRANSFERENCIA" && (
          <div>
            <label htmlFor="reference" className="block text-sm font-medium text-gray-700">Referencia</label>
            <input type="text" id="reference" name="reference" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
        )}

        {paymentMethod === "ZELLE" && (
          <div>
            <label htmlFor="zelle_email" className="block text-sm font-medium text-gray-700">Correo electrónico</label>
            <input type="email" id="zelle_email" name="zelle_email" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
            <label htmlFor="reference" className="block text-sm font-medium text-gray-700 mt-4">Referencia</label>
            <input type="text" id="reference" name="reference" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
          </div>
        )}

        <div>
          <label htmlFor="shippingOption" className="block text-sm font-medium text-gray-700">Entrega local (Barinas)</label>
          <select
            id="shippingOption"
            name="shippingOption"
            value={shippingOption}
            onChange={(e) => setShippingOption(e.target.value as ShippingOption)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">Automática</option>
            <option value="RETIRO_TIENDA">Retiro en tienda</option>
            <option value="DELIVERY">Delivery (incluido)</option>
          </select>
          <div className="text-xs text-gray-500 mt-1">Si estás en Barinas, puedes elegir Retiro en tienda o Delivery incluido.</div>
        </div>

        <div>
          <label htmlFor="shippingCarrier" className="block text-sm font-medium text-gray-700">Carrier (si no estás en Barinas)</label>
          <select
            id="shippingCarrier"
            name="shippingCarrier"
            value={shippingCarrier}
            onChange={(e) => setShippingCarrier(e.target.value as ShippingCarrier)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            disabled={isLocalBarinas}
          >
            <option value="">Automático</option>
            <option value="TEALCA">TEALCA</option>
            <option value="MRW">MRW</option>
          </select>
          <div className="text-xs text-gray-500 mt-1">{isLocalBarinas ? 'No aplica para entregas locales.' : 'Para envíos nacionales puedes elegir TEALCA o MRW.'}</div>
        </div>

        <div className="text-xs text-gray-600">
          El total a pagar se calculará con IVA y, si eliges Bs (VES), se convertirá usando la tasa vigente en el paso de revisión.
        </div>
      </div>
    </div>
  );
}
