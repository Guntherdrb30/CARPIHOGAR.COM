'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { confirmOrderAction } from '@/server/actions/orders';
import ProductCard from '@/components/product-card';
import PaymentInstructions from '@/components/payment-instructions';
import { useCartStore } from '@/store/cart';

type PaymentMethod = 'PAGO_MOVIL' | 'TRANSFERENCIA' | 'ZELLE';
type PaymentCurrency = 'USD' | 'VES';
type ShippingOption = '' | 'RETIRO_TIENDA' | 'DELIVERY';
type ShippingCarrier = '' | 'TEALCA' | 'MRW';
type Address = { id: string; fullname: string; phone: string; state: string; city: string; zone?: string | null; address1: string; address2?: string | null; notes?: string | null };

function formatUSD(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVES(n: number) {
  return 'Bs.S. ' + n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="order-90 w-full bg-brand text-white py-2 rounded-lg hover:bg-opacity-90 disabled:opacity-60"
    >
      {pending ? 'Enviandoâ¦' : 'Confirmar pago'}
    </button>
  );
}
export default function RevisarPage() {
  const items = useCartStore((s) => s.items);
  const getTotalUSD = useCartStore((s) => s.getTotalUSD);
  const clearCart = useCartStore((s) => s.clearCart);
  const refreshStocks = useCartStore((s) => s.refreshStocks);
  const hasConfigurable = useMemo(
    () => items.some((item) => item.type === 'configurable'),
    [items],
  );

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PAGO_MOVIL');
  const [paymentCurrency, setPaymentCurrency] = useState<PaymentCurrency>('USD');
  const [shippingOption, setShippingOption] = useState<ShippingOption>('');
  const [shippingCarrier, setShippingCarrier] = useState<ShippingCarrier>('');
  const [detectedCity, setDetectedCity] = useState('');
  const [isLocalBarinas, setIsLocalBarinas] = useState(false);
  const [hasAddress, setHasAddress] = useState(true);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  // Update locality (Barinas) based on selected address
  useEffect(() => {
    try {
      const a = addresses.find(a => a.id === selectedAddressId) || null;
      const city = String(a?.city || '');
      const local = /barinas/i.test(city);
      setDetectedCity(city);
      setIsLocalBarinas(local);
      if (local) { setShippingCarrier(''); } else { setShippingOption(''); }
    } catch {}
  }, [addresses, selectedAddressId]);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [tasaTop, setTasaTop] = useState<number>(40);
  const [proofUrl, setProofUrl] = useState<string>("" );
  const searchParams = useSearchParams();
  const router = useRouter();

    // Load user's addresses and initialize selection
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/addresses/me', { credentials: 'include' });
        if (!res.ok) return;
        const list = await res.json();
        if (cancelled) return;
        setAddresses(list || []);
        setHasAddress((list || []).length > 0);
        let saved = '';
        try { saved = localStorage.getItem('checkout.addressId') || ''; } catch {}
        const exists = Array.isArray(list) && list.some((a: any) => a?.id === saved);
        const initial = exists ? saved : ((Array.isArray(list) && list[0]?.id) || '');
        setSelectedAddressId(initial);
      } catch {}
    })();
    return () => { cancelled = true };
  }, []);// ConfiguraciÃ³n (puede venir de BD/ajustes si se requiere)
  const [ivaPercent, setIvaPercent] = useState<number>(16);
  const [settingsIvaPercent, setSettingsIvaPercent] = useState<number>(16);
  const [ivaEnabled, setIvaEnabled] = useState<boolean>(true);
  const [tasaVES, setTasaVES] = useState<number>(40);
  const [usdDiscountEnabled, setUsdDiscountEnabled] = useState<boolean>(true);
  const [usdDiscountPercent, setUsdDiscountPercent] = useState<number>(20);
  const [vesSalesDisabled, setVesSalesDisabled] = useState<boolean>(false);

  const subtotal = useMemo(() => getTotalUSD(), [getTotalUSD, items]);
  const discountableSubtotalUSD = useMemo(() => {
    if (paymentCurrency !== 'USD' || !usdDiscountEnabled) return 0;
    return items.reduce((sum, item) => {
      const supplierCurrency = String(item.supplierCurrency || '').toUpperCase();
      if (!supplierCurrency) return sum;
      if (supplierCurrency === 'VES') return sum;
      return sum + item.priceUSD * item.quantity;
    }, 0);
  }, [items, paymentCurrency, usdDiscountEnabled]);
  const discountPct = useMemo(() => {
    if (paymentCurrency !== 'USD' || !usdDiscountEnabled) return 0;
    return Math.max(0, Number(usdDiscountPercent || 0)) / 100;
  }, [paymentCurrency, usdDiscountEnabled, usdDiscountPercent]);
  const discountUSD = useMemo(
    () => discountableSubtotalUSD * discountPct,
    [discountableSubtotalUSD, discountPct],
  );
  const taxableBaseUSD = useMemo(
    () => subtotal - discountUSD,
    [subtotal, discountUSD],
  );
  const iva = useMemo(
    () => taxableBaseUSD * (ivaPercent / 100),
    [taxableBaseUSD, ivaPercent],
  );
  const totalUSD = useMemo(
    () => taxableBaseUSD + iva,
    [taxableBaseUSD, iva],
  );
  const totalVES = useMemo(
    () => totalUSD * tasaVES,
    [totalUSD, tasaVES],
  );
  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number | null>(null);
  const [deliveryCalcError, setDeliveryCalcError] = useState<string | null>(null);

  // Calcular fee de delivery estimado cuando:
  // - hay direcciГіn seleccionada
  // - el usuario elige DELIVERY
  useEffect(() => {
    let cancelled = false;
    async function computeDelivery() {
      if (!selectedAddressId || shippingOption !== 'DELIVERY') {
        setDeliveryFeeUSD(null);
        setDeliveryCalcError(null);
        return;
      }
      try {
        const addr = addresses.find((a) => a.id === selectedAddressId);
        if (!addr) {
          setDeliveryFeeUSD(null);
          setDeliveryCalcError('No se pudo leer la direcciГіn seleccionada.');
          return;
        }
        // Por ahora, como no tenemos lat/lng en la direcciГіn ni sucursal desde aquГ­,
        // usamos los mГ­nimos configurados: 4 USD para moto, 10 USD para camioneta.
        // Esto estarГЎ alineado con el cГЎlculo real al asignar delivery.
        const base = 4;
        if (!cancelled) {
          setDeliveryFeeUSD(base);
          setDeliveryCalcError(null);
        }
      } catch {
        if (!cancelled) {
          setDeliveryFeeUSD(null);
          setDeliveryCalcError('No se pudo calcular el delivery en este momento.');
        }
      }
    }
    computeDelivery();
    return () => { cancelled = true; };
  }, [selectedAddressId, shippingOption, addresses]);

  const initialState = { ok: false as boolean, error: '' as string };
  const [state, formAction] = useFormState(confirmOrderAction as any, initialState);
  const [errors, setErrors] = useState<{ reference?: string; pm_phone?: string; zelle_email?: string; zelle_payer_name?: string }>({});

  // Cargar IVA y tasaVES desde ajustes (incluye tasa del BCV).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/payment', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const percent = typeof data.ivaPercent === 'number' ? Number(data.ivaPercent) : 16;
        setSettingsIvaPercent(percent);
        const enabled = Boolean(data.ecommerceIvaEnabled ?? true);
        setIvaEnabled(enabled);
        setIvaPercent(enabled ? percent : 0);
        if (typeof data.tasaVES === 'number') {
          setTasaVES(Number(data.tasaVES) || 40);
          setTasaTop(Number(data.tasaVES) || 40);
        }
        if (typeof data.usdPaymentDiscountEnabled === 'boolean') {
          setUsdDiscountEnabled(Boolean(data.usdPaymentDiscountEnabled));
        }
        if (typeof data.usdPaymentDiscountPercent === 'number') {
          setUsdDiscountPercent(Number(data.usdPaymentDiscountPercent) || 0);
        }
        if (typeof data.vesSalesDisabled === 'boolean') {
          setVesSalesDisabled(Boolean(data.vesSalesDisabled));
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (vesSalesDisabled && paymentCurrency === 'VES') {
      setPaymentCurrency('USD');
    }
  }, [vesSalesDisabled, paymentCurrency]);

  useEffect(() => {
    if (!items.length) return;
    refreshStocks({ currency: paymentCurrency, includePrices: true });
  }, [items.length, paymentCurrency, refreshStocks]);

  // Ajuste inicial: si la moneda es USD, forzar 'ZELLE' como método por defecto
  // para que las instrucciones se muestren de inmediato. Si es VES, usar Pago Móvil.
  useEffect(() => {
    const usdAllowed: PaymentMethod[] = ['ZELLE', 'TRANSFERENCIA'];
    const vesAllowed: PaymentMethod[] = ['PAGO_MOVIL', 'TRANSFERENCIA'];
    if (paymentCurrency === 'USD') {
      if (!usdAllowed.includes(paymentMethod)) setPaymentMethod('ZELLE');
    } else {
      if (!vesAllowed.includes(paymentMethod)) setPaymentMethod('PAGO_MOVIL');
    }
  }, [paymentCurrency]);

  async function handleProofUpload(file: File | null) {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "image");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.url) setProofUrl(String(json.url));
    } catch {}
  }


  

  // If no address on file, redirect to Datos de Envío and come back after
  useEffect(() => {
    if (hasAddress === false) {
      try {
        const next = `${location.pathname}${location.search || ''}`;
        const params = new URLSearchParams();
        params.set('next', next);
        router.replace(`/checkout/datos-envio?${params.toString()}`);
      } catch {}
    }
  }, [hasAddress, router]);

  // persist shipping selections
  useEffect(() => {
    try { localStorage.setItem('checkout.shippingOption', shippingOption); } catch {}
  }, [shippingOption]);
  useEffect(() => {
    try { localStorage.setItem('checkout.shippingCarrier', shippingCarrier); } catch {}
  }, [shippingCarrier]);

  // Pantalla de éxito personalizada
  if (state?.ok) {
    const orderId = (state as any).orderId as string | undefined;
    const pdfPath = orderId ? `/api/orders/${orderId}/pdf?tipo=recibo&moneda=USD` : '';
    let shareUrl = '';
    try {
      if (orderId && typeof window !== 'undefined') {
        const full = `${location.origin}${pdfPath}`;
        const text = `Mi recibo de compra Carpihogar: ${full}`;
        shareUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      }
    } catch {}
    return (
      <div className="container mx-auto p-4">
        <div className="bg-white shadow-md rounded-lg p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Gracias por tu compra</h1>
          <p className="text-gray-700 mb-6">Hemos recibido tu pago. Está en revisión.</p>

          <div className="flex flex-col items-center gap-3">
            <a href="/productos" className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white rounded-lg hover:bg-opacity-90">
              Seguir comprando
            </a>

            {/* Controles de PDF y WhatsApp removidos */}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Revisar orden</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white shadow-md rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Resumen de la orden</h2>
          {hasConfigurable && (
            <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="font-semibold mb-1">Muebles personalizados</div>
              <p>
                Los muebles personalizados se entregan entre 10 y 15 días después de la compra.
                Si el tiempo fuera mayor por cantidad de pedidos, te contactaremos por WhatsApp
                para informarte la fecha de envío.
              </p>
            </div>
          )}
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between items-start gap-3">
                <div className="flex flex-col">
                  <span>
                    {item.name} (x{item.quantity})
                  </span>
                  {item.type === 'configurable' && (
                    <span className="mt-1 inline-flex items-center rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-[11px] font-semibold">
                      Mueble personalizado
                    </span>
                  )}
                </div>
                <span>{formatUSD(item.priceUSD * item.quantity)}</span>
              </div>
            ))}
          </div>
          <hr className="my-4" />
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatUSD(subtotal)}</span>
            </div>
            {paymentCurrency === 'USD' && usdDiscountEnabled && discountUSD > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Descuento {Number(usdDiscountPercent || 0).toFixed(2)}% pago en USD (proveedores USD):</span>
                <span>-{formatUSD(discountUSD)}</span>
              </div>
            )}
            {shippingOption === 'DELIVERY' && (
              <div className="flex justify-between text-blue-700">
                <span>Delivery local (estimado):</span>
                <span>
                  {deliveryFeeUSD != null ? formatUSD(deliveryFeeUSD) : 'A calcular'}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Base imponible:</span>
              <span>{formatUSD(taxableBaseUSD)}</span>
            </div>
            {ivaEnabled && (
              <div className="flex justify-between">
                <span>IVA ({settingsIvaPercent}%):</span>
                <span>{formatUSD(iva)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold">
              <span>Total (USD):</span>
              <span>{formatUSD(totalUSD)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Total (VES):</span>
              <span>{formatVES(totalVES)}</span>
            </div>
          </div>
          {paymentCurrency === 'USD' && usdDiscountEnabled && discountUSD > 0 && (
            <div className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
              Pagando en dolares obtienes un {Number(usdDiscountPercent || 0).toFixed(2)}% de descuento en productos de proveedores en USD.
            </div>
          )}
        </div>

        <div className="bg-white shadow-md rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Pago</h2>

          <form action={formAction} className="flex flex-col space-y-4" onSubmit={(e) => {
            const next: any = {};
            const form = e.currentTarget as HTMLFormElement;
            const reference = (form.querySelector('#reference') as HTMLInputElement | null)?.value || '';
            const pmPhone = (form.querySelector('#pm_phone') as HTMLInputElement | null)?.value || '';
            const zellePayerName = (form.querySelector('#zelle_payer_name') as HTMLInputElement | null)?.value || '';
            if (!reference.trim()) next.reference = 'La referencia es obligatoria';
            if (paymentMethod === 'PAGO_MOVIL' && !pmPhone.trim()) next.pm_phone = 'El telÃ©fono es obligatorio';
            if (paymentMethod === 'ZELLE') {
              if (!zellePayerName.trim()) next.zelle_payer_name = 'El nombre del titular es obligatorio';
            }
            setErrors(next);
            if (Object.keys(next).length) e.preventDefault();
          }}>
            <div className="order-20">
  <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700">Método de pago</label>
  <select
    id="paymentMethod"
    name="paymentMethod"
    value={paymentMethod}
    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
  >
    {paymentCurrency === 'USD' ? (
      <>
        <option value="ZELLE">Zelle</option>
        <option value="TRANSFERENCIA">Depósito en banco</option>
      </>
    ) : (
      <>
        <option value="PAGO_MOVIL">Pago Móvil</option>
        <option value="TRANSFERENCIA">Transferencia</option>
      </>
    )}
  </select>
</div>

            <div className="order-first">
              <label htmlFor="paymentCurrency" className="block text-sm font-medium text-gray-700">Moneda del pago</label>
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

            {paymentMethod === 'PAGO_MOVIL' && (
              <div className="order-30 space-y-3">
                <div className="text-sm text-gray-600">Realiza tu Pago MÃ³vil y coloca los datos:</div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="pm_phone">Teléfono</label>
                  <input id="pm_phone" name="pm_phone" type="text" required inputMode="tel" pattern="[0-9+()\s-]{10,}" title="Ej: +58 412 1234567 o 0412-1234567" className={`mt-1 block w-full rounded-md shadow-sm ${errors.pm_phone ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'}`} />
                  {errors.pm_phone && <div className="text-xs text-red-600 mt-1">{errors.pm_phone}</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="pm_payer_name">Nombre del titular</label>
                  <input id="pm_payer_name" name="pm_payer_name" type="text" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="pm_bank">Banco del titular</label>
                  <input id="pm_bank" name="pm_bank" type="text" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="reference">Referencia</label>
                  <input id="reference" name="reference" type="text" required className={`mt-1 block w-full rounded-md shadow-sm ${errors.reference ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'}`} />
                  {errors.reference && <div className="text-xs text-red-600 mt-1">{errors.reference}</div>}
                </div>
              </div>
            )}

            {/* Sección genérica de Transferencia removida */}

            {paymentMethod === 'ZELLE' && (
              <div className="order-30 space-y-3">
                <div className="text-sm text-gray-600">EnvÃ­a el pago por Zelle y coloca los datos:</div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="zelle_email">Correo Zelle</label>
                  <input id="zelle_email" name="zelle_email" type="email" required className={`mt-1 block w-full rounded-md shadow-sm ${errors.zelle_email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'}`} />
                  {errors.zelle_email && <div className="text-xs text-red-600 mt-1">{errors.zelle_email}</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="reference">Referencia</label>
                  <input id="reference" name="reference" type="text" required className={`mt-1 block w-full rounded-md shadow-sm ${errors.reference ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'}`} />
                  {errors.reference && <div className="text-xs text-red-600 mt-1">{errors.reference}</div>}
                </div>
              </div>
            )}

            {/* Campos adicionales según moneda y método */}
            {paymentMethod === 'ZELLE' && (
              <div className="order-30 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="zelle_payer_name">Nombre del titular de la cuenta</label>
                  <input id="zelle_payer_name" name="zelle_payer_name" type="text" required className={`mt-1 block w-full rounded-md shadow-sm ${errors.zelle_payer_name ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'}`} />
                  {errors.zelle_payer_name && <div className="text-xs text-red-600 mt-1">{errors.zelle_payer_name}</div>}
                </div>
              </div>
            )}

            {paymentMethod === 'TRANSFERENCIA' && paymentCurrency === 'USD' && (
              <div className="order-30 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="deposit_bank">Banco</label>
                  <select id="deposit_bank" name="deposit_bank" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" defaultValue="">
                    <option value="" disabled>Selecciona banco</option>
                    <option value="BANESCO">Banesco</option>
                    <option value="MERCANTIL">Mercantil</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">Selecciona un banco para ver los datos de depósito y copiarlos.</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="deposit_payer_name">Nombre del depositante</label>
                  <input id="deposit_payer_name" name="deposit_payer_name" type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="deposit_payer_id">Cédula</label>
                  <input id="deposit_payer_id" name="deposit_payer_id" type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                </div>
              </div>
            )}

            {paymentMethod === 'TRANSFERENCIA' && paymentCurrency === 'VES' && (
              <div className="order-30 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="transfer_payer_name">Nombre del titular</label>
                  <input id="transfer_payer_name" name="transfer_payer_name" type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                </div>
                <div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="reference">Referencia</label>
                  <input id="reference" name="reference" type="text" required className={`mt-1 block w-full rounded-md shadow-sm ${errors.reference ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'}`} />
                  {errors.reference && <div className="text-xs text-red-600 mt-1">{errors.reference}</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="proof_file">Comprobante (imagen, opcional)</label>
                  <input id="proof_file" type="file" accept="image/*" className="mt-1 block w-full text-sm" onChange={(e) => handleProofUpload((e.target.files && e.target.files[0]) || null)} />
                  {proofUrl ? (<div className="text-xs text-gray-600 mt-1 break-all">Subido: {proofUrl}</div>) : null}
                  <input type="hidden" name="proofUrl" value={proofUrl} />
                </div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="transfer_payer_id">Cédula</label>
                  <input id="transfer_payer_id" name="transfer_payer_id" type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="transfer_bank">Banco</label>
                  <select id="transfer_bank" name="transfer_bank" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" defaultValue="">
                    <option value="" disabled>Selecciona banco</option>
                    <option value="BANESCO">Banesco</option>
                    <option value="MERCANTIL">Mercantil</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">Selecciona un banco para ver los datos de transferencia y copiarlos.</div>
                </div>
              </div>
            )}

            {/* Instrucciones de pago debajo de los campos del método seleccionado */}
            <PaymentInstructions method={paymentMethod} currency={paymentCurrency} />

            {!hasAddress && (
              <div className="bg-red-50 border-l-4 border-red-400 p-3 text-sm text-red-800 rounded mb-3">
                AÃºn no has agregado una direcciÃ³n de envÃ­o. Por favor completa tus datos en
                <a className="underline ml-1" href="/checkout/datos-envio">Datos de EnvÃ­o</a>
                {" "}o en
                <a className="underline ml-1" href="/dashboard/cliente">Mi Cuenta</a> para evitar errores en la entrega.
              </div>
            )}

            {/* Aviso de Barinas arriba de las direcciones */}
            {isLocalBarinas ? (
              <div className="mt-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-800">
                Detectamos ciudad {detectedCity || 'local'}. Puedes elegir Retiro en tienda o Delivery incluido.
              </div>
            ) : null}

            {/* Address selection */}
            <div className="order-40">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Dirección de envío</label>
                <a className="text-sm text-blue-600 underline" href="/checkout/datos-envio?next=/checkout/revisar">Añadir nueva</a>
              </div>
              {addresses.length === 0 ? (
                <div className="bg-red-50 border-l-4 border-red-400 p-3 text-sm text-red-800 rounded mb-3">
                  Aún no tienes direcciones guardadas. Agrega una en Datos de Envío.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {addresses.map(a => (
                    <label key={a.id} className="flex items-start gap-3 p-2 border rounded cursor-pointer">
                      <input
                        type="radio"
                        name="addressRadio"
                        className="mt-1"
                        checked={selectedAddressId === a.id}
                        onChange={() => setSelectedAddressId(a.id)}
                      />
                      <div className="text-sm">
                        <div className="font-medium">{a.fullname}  {a.phone}</div>
                        <div>{a.address1}{a.address2 ? `, ${a.address2}` : ''}</div>
                        <div>{a.zone ? `${a.zone}, ` : ''}{a.city}, {a.state}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {/* Info para envíos nacionales (si no es Barinas) */}
            {!isLocalBarinas ? (
              <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
                Para envios nacionales, puedes seleccionar TEALCA o MRW.
              </div>
            ) : null}


            <div className="order-50" style={{ display: isLocalBarinas ? 'block' : 'none' }}>
              <label htmlFor="shippingOption" className="block text-sm font-medium text-gray-700">Entrega local (Barinas)</label>
              <select
                id="shippingOption"
                name="shippingOption"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={shippingOption}
                onChange={(e) => setShippingOption(e.target.value as ShippingOption)}
              >
                <option value="">AutomÃ¡tica</option>
                <option value="RETIRO_TIENDA">Retiro en tienda</option>
                <option value="DELIVERY">Delivery (incluido)</option>
              </select>
              <div className="text-xs text-gray-500 mt-1">Si estÃ¡s en Barinas puedes elegir Retiro en tienda o Delivery incluido.</div>
            </div>

            <div className="order-50" style={{ display: isLocalBarinas ? 'none' : 'block' }}>
              <label htmlFor="shippingCarrier" className="block text-sm font-medium text-gray-700">Carrier (si no estÃ¡s en Barinas)</label>
              <select
                id="shippingCarrier"
                name="shippingCarrier"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={shippingCarrier}
                onChange={(e) => setShippingCarrier(e.target.value as ShippingCarrier)}
                disabled={isLocalBarinas}
              >
                <option value="">AutomÃ¡tico</option>
                <option value="TEALCA">TEALCA</option>
                <option value="MRW">MRW</option>
              </select>
              <div className="text-xs text-gray-500 mt-1">{isLocalBarinas ? 'No aplica para entregas locales.' : 'Para envÃ­os nacionales puedes elegir TEALCA o MRW.'}</div>
            </div>

            {/* Hidden payload */}
            <input type="hidden" name="items" value={JSON.stringify(items)} />
            <input type="hidden" name="tasaVES" value={String(tasaVES)} />
            <input type="hidden" name="ivaPercent" value={String(ivaPercent)} />
            <input type="hidden" name="paymentCurrency" value={paymentCurrency} />
            <input type="hidden" name="shippingAddressId" value={selectedAddressId} />

            {state?.error && (
              <div className="text-red-600 text-sm">{state.error}</div>
            )}

            <div className="text-sm text-gray-600">
              {paymentCurrency === 'USD' ? (
                <div>Total a pagar: $ {formatUSD(totalUSD)}</div>
              ) : (
                <div>Total a pagar: {formatVES(totalVES)}</div>
              )}
            </div>
            <SubmitButton />
          </form>
        </div>
      </div>
    </div>
  );
}

