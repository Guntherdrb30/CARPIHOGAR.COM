import { getAllyQuoteById, updateQuoteByForm } from "@/server/actions/quotes";
import { getSettings } from "@/server/actions/settings";
import QuoteEditForm from "@/components/aliado/quote-edit-form";

export default async function EditarPresupuestoAliadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quote, settings] = await Promise.all([getAllyQuoteById(id), getSettings()]);
  const iva = Number((quote as any).ivaPercent || (settings as any).ivaPercent || 16);
  const tasa = Number((quote as any).tasaVES || (settings as any).tasaVES || 40);
  const initialItems = quote.items.map((it: any) => {
    const p1 = Number(it.product?.priceUSD ?? it.priceUSD);
    const p2 = it.product?.priceAllyUSD != null ? Number(it.product.priceAllyUSD) : null;
    return {
      productId: it.productId,
      name: it.name,
      p1,
      p2,
      priceUSD: Number(it.priceUSD),
      quantity: Number(it.quantity),
    };
  });
  const backTo = `/dashboard/aliado/presupuestos/${id}`;
  return (
    <div className="container mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Editar Presupuesto {quote.id.slice(-6)}</h1>
      <div className="bg-white p-4 rounded-lg shadow">
        <QuoteEditForm
          quoteId={quote.id}
          ivaPercent={iva}
          tasaVES={tasa}
          initialItems={initialItems}
          initialNotes={(quote as any).notes || ''}
          initialTaxId={(quote as any).customerTaxId || ''}
          initialFiscalAddress={(quote as any).customerFiscalAddress || ''}
          action={updateQuoteByForm}
          backTo={backTo}
        />
      </div>
    </div>
  );
}
