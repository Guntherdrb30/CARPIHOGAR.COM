import OfflineSaleForm from "@/components/admin/offline-sale-form";
import { getSaleHoldById, getSellers, saveSaleHold } from "@/server/actions/sales";
import { getSettings } from "@/server/actions/settings";
import { createOfflineSale } from "@/server/actions/sales";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceAdjustmentSettings } from "@/server/price-adjustments";
import { getQuoteById } from "@/server/actions/quotes";

type SalePageQuery = {
  error?: string;
  message?: string;
  holdId?: string;
  fromQuote?: string;
  shipping?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerTaxId?: string;
  customerFiscalAddress?: string;
  docType?: string;
  lockDocType?: string;
  carpentryProjectId?: string;
  backTo?: string;
};

export default async function NuevaVentaPage({ searchParams }: { searchParams?: Promise<SalePageQuery> }) {
  const sp = (await searchParams) || ({} as SalePageQuery);
  const decodeValue = (value?: string) => (value ? decodeURIComponent(String(value)) : undefined);
  const initialCustomerNameOverride = decodeValue(sp.customerName);
  const initialCustomerEmailOverride = decodeValue(sp.customerEmail);
  const initialCustomerPhoneOverride = decodeValue(sp.customerPhone);
  const initialCustomerTaxIdOverride = decodeValue(sp.customerTaxId);
  const initialCustomerFiscalAddressOverride = decodeValue(sp.customerFiscalAddress);
  const docTypeQuery = decodeValue(sp.docType);
  const docTypeCandidate =
    docTypeQuery === "factura" ? "factura" : docTypeQuery === "recibo" ? "recibo" : undefined;
  const lockDocTypeFlag = ["1", "true", "yes"].includes(String(sp.lockDocType || "").toLowerCase());
  const docTypeOptions = lockDocTypeFlag && docTypeCandidate ? [docTypeCandidate] : undefined;
  const prefillBackTo = decodeValue(sp.backTo);
  const prefillCarpentryProjectId = decodeValue(sp.carpentryProjectId);
  const [sellers, settings, session, pricing] = await Promise.all([
    getSellers(),
    getSettings(),
    getServerSession(authOptions),
    getPriceAdjustmentSettings(),
  ]);
  const commission = Number((settings as any).sellerCommissionPercent || 5);
  const iva = Number((settings as any).ivaPercent || 16);
  const tasa = Number((settings as any).tasaVES || 40);
  const vesSalesDisabled = Boolean((settings as any).vesSalesDisabled ?? false);
  const role = String((session?.user as any)?.role || '');
  const userId = String((session?.user as any)?.id || '');
  const allowCredit = role === 'ADMIN';
  const unlockWithDeleteSecret = role === 'VENDEDOR';
  const maxPriceMode: 'P1' | 'P2' | 'P3' = 'P3';
  const fromQuote = String(sp.fromQuote || '');
  const holdId = String(sp.holdId || '');
  let initialItems: Array<{ productId: string; name: string; p1: number; p2?: number | null; p3?: number | null; priceUSD: number; quantity: number; supplierCurrency?: string | null }> | undefined = undefined;
  let initialSellerId: string | undefined = undefined;
  let initialCustomerName: string | undefined = initialCustomerNameOverride;
  let initialCustomerEmail: string | undefined = initialCustomerEmailOverride;
  let initialCustomerPhone: string | undefined = initialCustomerPhoneOverride;
  let initialCustomerTaxId: string | undefined = initialCustomerTaxIdOverride;
  let initialCustomerFiscalAddress: string | undefined = initialCustomerFiscalAddressOverride;
  let initialPaymentMethod: "PAGO_MOVIL" | "TRANSFERENCIA" | "ZELLE" | "EFECTIVO" | undefined = undefined;
  let initialPaymentCurrency: "USD" | "VES" | undefined = undefined;
  let initialPaymentReference: string | undefined = undefined;
  let initialPmPayerName: string | undefined = undefined;
  let initialPmPayerPhone: string | undefined = undefined;
  let initialPmPayerBank: string | undefined = undefined;
  let initialSendEmail: boolean | undefined = undefined;
  let initialDocType: "recibo" | "factura" | undefined = docTypeCandidate;
  let initialSaleType: "CONTADO" | "CREDITO" | undefined = undefined;
  let initialCreditDueDate: string | undefined = undefined;
  let initialAddressMode: "saved" | "new" | undefined = undefined;
  let initialSelectedAddressId: string | undefined = undefined;
  let initialAddrState: string | undefined = undefined;
  let initialAddrCity: string | undefined = undefined;
  let initialAddrZone: string | undefined = undefined;
  let initialAddr1: string | undefined = undefined;
  let initialAddr2: string | undefined = undefined;
  let initialAddrNotes: string | undefined = undefined;
  let initialPriceMode: 'P1' | 'P2' | 'P3' | undefined = undefined;
  let initialShippingFromHold: string | undefined = undefined;
  let holdOriginQuoteId: string | undefined = undefined;
  let holdError: string | undefined = undefined;
  if (fromQuote) {
    try {
      const quote = await getQuoteById(fromQuote);
      if (quote) {
        initialItems = quote.items.map((it: any) => {
          const p1 = Number(it.priceUSD);
          const p2 = it.product?.priceAllyUSD != null ? Number(it.product.priceAllyUSD) : null;
          const p3 = it.product?.priceWholesaleUSD != null ? Number(it.product.priceWholesaleUSD) : null;
          const supplierCurrency = it.product?.supplier?.chargeCurrency || null;
          return {
            productId: it.productId,
            name: it.name,
            sku: it.product?.sku || null,
            availableQty: Number(it.stock || 0),
            p1,
            p2,
            p3,
            priceUSD: p1,
            quantity: Number(it.quantity),
            supplierCurrency,
          };
        });
        initialSellerId = quote.sellerId || undefined;
        initialCustomerName = quote.user?.name || undefined;
        initialCustomerEmail = quote.user?.email || undefined;
        initialCustomerPhone = quote.user?.phone || undefined;
        initialCustomerTaxId = quote.customerTaxId || undefined;
        initialCustomerFiscalAddress = quote.customerFiscalAddress || undefined;
      }
    } catch {}
  }
  if (holdId) {
    try {
      const hold = await getSaleHoldById(holdId);
      if (hold) {
        if (role !== 'ADMIN' && String((hold as any).createdById || '') !== userId && String((hold as any).sellerId || '') !== userId) {
          holdError = 'No autorizado para abrir esta venta en espera.';
        } else {
        const meta = (hold as any).meta || {};
        const parsedItems = Array.isArray((hold as any).items) ? (hold as any).items : [];
        initialItems = parsedItems.map((it: any) => ({
          productId: String(it.productId || ''),
          name: String(it.name || ''),
          sku: String(it.sku || ''),
          availableQty: Number(it.availableQty || 0),
          p1: Number(it.p1 || it.priceUSD || 0),
          p2: it.p2 != null ? Number(it.p2) : null,
          p3: it.p3 != null ? Number(it.p3) : null,
          priceUSD: Number(it.priceUSD || 0),
          quantity: Number(it.quantity || 1),
          supplierCurrency: it.supplierCurrency || null,
        }));
        initialSellerId = String((hold as any).sellerId || '') || undefined;
        initialCustomerName = String((hold as any).customerName || '') || undefined;
        initialCustomerEmail = String((hold as any).customerEmail || '') || undefined;
        initialCustomerPhone = String((hold as any).customerPhone || '') || undefined;
        initialCustomerTaxId = String((hold as any).customerTaxId || '') || undefined;
        initialCustomerFiscalAddress = String((hold as any).customerFiscalAddress || '') || undefined;
        const paymentMethodCandidate = String(meta.paymentMethod || '').toUpperCase();
        if (['PAGO_MOVIL', 'TRANSFERENCIA', 'ZELLE', 'EFECTIVO'].includes(paymentMethodCandidate)) {
          initialPaymentMethod = paymentMethodCandidate as any;
        }
        const paymentCurrencyCandidate = String(meta.paymentCurrency || '').toUpperCase();
        if (paymentCurrencyCandidate === 'USD' || paymentCurrencyCandidate === 'VES') {
          initialPaymentCurrency = paymentCurrencyCandidate as any;
        }
        initialPaymentReference = String(meta.paymentReference || '') || undefined;
        initialPmPayerName = String(meta.pmPayerName || '') || undefined;
        initialPmPayerPhone = String(meta.pmPayerPhone || '') || undefined;
        initialPmPayerBank = String(meta.pmBank || '') || undefined;
        initialSendEmail = String(meta.sendEmail || '') === 'true' || meta.sendEmail === true;
        initialDocType = String(meta.docType || '') === 'recibo' ? 'recibo' : 'factura';
        initialSaleType = String(meta.saleType || '').toUpperCase() === 'CREDITO' ? 'CREDITO' : 'CONTADO';
        initialCreditDueDate = String(meta.creditDueDate || '') || undefined;
        initialAddressMode = String(meta.addrMode || '') === 'saved' ? 'saved' : 'new';
        initialSelectedAddressId = String(meta.selectedAddressId || '') || undefined;
        initialAddrState = String(meta.addrState || '') || undefined;
        initialAddrCity = String(meta.addrCity || '') || undefined;
        initialAddrZone = String(meta.addrZone || '') || undefined;
        initialAddr1 = String(meta.addr1 || '') || undefined;
        initialAddr2 = String(meta.addr2 || '') || undefined;
        initialAddrNotes = String(meta.addrNotes || '') || undefined;
        const pm = String(meta.priceMode || '').toUpperCase();
        if (pm === 'P1' || pm === 'P2' || pm === 'P3') {
          initialPriceMode = pm as any;
        }
        const originQuoteCandidate = String(meta.originQuoteId || '').trim();
        if (originQuoteCandidate) holdOriginQuoteId = originQuoteCandidate;
        const shippingCandidate = String(meta.shippingLocalOption || '').toUpperCase();
        if (shippingCandidate === 'RETIRO_TIENDA' || shippingCandidate === 'DELIVERY') {
          initialShippingFromHold = shippingCandidate;
        }
        }
      } else {
        holdError = 'Venta en espera no encontrada.';
      }
    } catch {
      holdError = 'No se pudo cargar la venta en espera.';
    }
  }
  const initialShipping = (() => {
    const s = String((sp as any).shipping || '').toUpperCase();
    return (s === 'RETIRO_TIENDA' || s === 'DELIVERY') ? (s as any) : '';
  })();
  const initialShippingFinal = initialShippingFromHold ? (initialShippingFromHold as any) : initialShipping;
  const effectiveHoldId = holdError ? '' : holdId;

  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Nueva Venta (Tienda)</h1>
      {sp.error && (
        <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">{sp.error}</div>
      )}
      {sp.message && (
        <div className="border border-green-200 bg-green-50 text-green-800 px-3 py-2 rounded">{sp.message}</div>
      )}
      {holdError && (
        <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">{holdError}</div>
      )}
      <div className="text-sm">
        <a href="/dashboard/admin/ventas/espera" className="text-blue-600 hover:underline">
          Ver ventas en espera
        </a>
      </div>
      <div className="bg-white p-4 rounded-lg shadow">
        <OfflineSaleForm
          sellers={sellers}
          commissionPercent={commission}
          ivaPercent={iva}
          tasaVES={tasa}
          action={createOfflineSale}
          holdAction={saveSaleHold}
          vesSalesDisabled={vesSalesDisabled}
          allowCredit={allowCredit}
          unlockCreditWithDeleteSecret={unlockWithDeleteSecret}
          initialItems={initialItems}
          initialShippingLocalOption={initialShippingFinal}
          originQuoteId={holdOriginQuoteId || fromQuote || undefined}
          initialSellerId={initialSellerId}
          initialCustomerName={initialCustomerName}
          initialCustomerEmail={initialCustomerEmail}
          initialCustomerPhone={initialCustomerPhone}
          initialCustomerTaxId={initialCustomerTaxId}
          initialCustomerFiscalAddress={initialCustomerFiscalAddress}
          initialPriceMode={initialPriceMode || "P1"}
          maxPriceMode={maxPriceMode}
          usdPaymentDiscountEnabled={Boolean(pricing.usdPaymentDiscountEnabled)}
          usdPaymentDiscountPercent={Number(pricing.usdPaymentDiscountPercent || 0)}
          holdId={effectiveHoldId || undefined}
          initialPaymentMethod={initialPaymentMethod}
          initialPaymentCurrency={initialPaymentCurrency}
          initialPaymentReference={initialPaymentReference}
          initialPmPayerName={initialPmPayerName}
          initialPmPayerPhone={initialPmPayerPhone}
          initialPmPayerBank={initialPmPayerBank}
          initialSendEmail={initialSendEmail}
          initialDocType={initialDocType}
          availableDocTypes={docTypeOptions}
          initialSaleType={initialSaleType}
          initialCreditDueDate={initialCreditDueDate}
          initialAddressMode={initialAddressMode}
          initialSelectedAddressId={initialSelectedAddressId}
          initialAddrState={initialAddrState}
          initialAddrCity={initialAddrCity}
          initialAddrZone={initialAddrZone}
          initialAddr1={initialAddr1}
          initialAddr2={initialAddr2}
          initialAddrNotes={initialAddrNotes}
          carpentryProjectId={prefillCarpentryProjectId}
          backTo={prefillBackTo}
        />
      </div>
    </div>
  );
}
