import OfflineSaleForm from "@/components/admin/offline-sale-form";
import { getSellers } from "@/server/actions/sales";
import { getSettings } from "@/server/actions/settings";
import { createOfflineSale } from "@/server/actions/sales";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceAdjustmentSettings } from "@/server/price-adjustments";
import { getQuoteById } from "@/server/actions/quotes";

export default async function NuevaVentaPage({ searchParams }: { searchParams?: Promise<{ error?: string; fromQuote?: string; shipping?: string }> }) {
  const sp = (await searchParams) || {} as any;
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
  const allowCredit = role === 'ADMIN';
  const unlockWithDeleteSecret = role === 'VENDEDOR';
  const maxPriceMode: 'P1' | 'P2' | 'P3' = 'P3';
  const fromQuote = String((sp as any).fromQuote || '');
  let initialItems: Array<{ productId: string; name: string; p1: number; p2?: number | null; p3?: number | null; priceUSD: number; quantity: number; supplierCurrency?: string | null }> | undefined = undefined;
  let initialSellerId: string | undefined = undefined;
  let initialCustomerName: string | undefined = undefined;
  let initialCustomerEmail: string | undefined = undefined;
  let initialCustomerPhone: string | undefined = undefined;
  let initialCustomerTaxId: string | undefined = undefined;
  let initialCustomerFiscalAddress: string | undefined = undefined;
  if (fromQuote) {
    try {
      const quote = await getQuoteById(fromQuote);
      if (quote) {
        initialItems = quote.items.map((it: any) => {
          const p1 = Number(it.priceUSD);
          const p2 = it.product?.priceAllyUSD != null ? Number(it.product.priceAllyUSD) : null;
          const p3 = it.product?.priceWholesaleUSD != null ? Number(it.product.priceWholesaleUSD) : null;
          const supplierCurrency = it.product?.supplier?.chargeCurrency || null;
          return { productId: it.productId, name: it.name, p1, p2, p3, priceUSD: p1, quantity: Number(it.quantity), supplierCurrency };
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
  const initialShipping = (() => {
    const s = String((sp as any).shipping || '').toUpperCase();
    return (s === 'RETIRO_TIENDA' || s === 'DELIVERY') ? (s as any) : '';
  })();

  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Nueva Venta (Tienda)</h1>
      {sp.error && (
        <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">{sp.error}</div>
      )}
      <div className="bg-white p-4 rounded-lg shadow">
        <OfflineSaleForm
          sellers={sellers}
          commissionPercent={commission}
          ivaPercent={iva}
          tasaVES={tasa}
          action={createOfflineSale}
          vesSalesDisabled={vesSalesDisabled}
          allowCredit={allowCredit}
          unlockCreditWithDeleteSecret={unlockWithDeleteSecret}
          initialItems={initialItems}
          initialShippingLocalOption={initialShipping}
          originQuoteId={fromQuote || undefined}
          initialSellerId={initialSellerId}
          initialCustomerName={initialCustomerName}
          initialCustomerEmail={initialCustomerEmail}
          initialCustomerPhone={initialCustomerPhone}
          initialCustomerTaxId={initialCustomerTaxId}
          initialCustomerFiscalAddress={initialCustomerFiscalAddress}
          initialPriceMode="P1"
          maxPriceMode={maxPriceMode}
          usdPaymentDiscountEnabled={Boolean(pricing.usdPaymentDiscountEnabled)}
          usdPaymentDiscountPercent={Number(pricing.usdPaymentDiscountPercent || 0)}
        />
      </div>
    </div>
  );
}
