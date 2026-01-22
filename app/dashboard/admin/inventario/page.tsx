import { getInventorySummary } from "@/server/actions/inventory";
import { getCategoriesFlattened } from "@/server/actions/categories";
import ProductQuickSearch from "@/components/admin/product-quick-search";
import TopSupplierKPI from "@/components/admin/top-supplier-kpi";
import LowStockPanel from "@/components/admin/low-stock-panel";
import RecentMovesPanel from "@/components/admin/recent-moves-panel";
import InventoryRefreshButton from "@/components/admin/inventory-refresh-button";
import TopSoldPanel from "@/components/admin/top-sold-panel";
import LeastSoldPanel from "@/components/admin/least-sold-panel";

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    days?: string;
    top?: string;
    low?: string;
    cat?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = (await searchParams) || ({} as any);
  const days = Number(sp.days ?? 30);
  const topLimit = Number(sp.top ?? 10);
  const lowLimit = Number(sp.low ?? 10);
  const cat = (sp.cat ?? '') as string;
  const from = String(sp.from ?? '');
  const to = String(sp.to ?? '');
  const reportParams = new URLSearchParams();
  if (from) reportParams.set('from', from);
  if (to) reportParams.set('to', to);
  const reportQs = reportParams.toString();

  let summary: any = { productsCount: 0, totalUnits: 0, totalValueUSD: 0, lowStockThreshold: 5, lowStockCount: 0 };
  let categories: any[] = [];
  try {
    const r = await Promise.all([
      getInventorySummary(),
      getCategoriesFlattened(),
    ]);
    summary = r[0] || summary;
    categories = Array.isArray(r[1]) ? r[1] : [];
  } catch {}

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventario</h1>
        <InventoryRefreshButton />
      </div>

      {/* Búsqueda rápida */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-2">Búsqueda de productos</h2>
        <ProductQuickSearch />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Productos</div>
          <div className="text-2xl font-bold">{summary.productsCount}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Unidades en stock</div>
          <div className="text-2xl font-bold">{summary.totalUnits}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Valorización (USD)</div>
          <div className="text-2xl font-bold">
            {Number((summary as any).totalValueUSD ?? 0).toFixed(2)}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">
            Bajo stock (= {summary.lowStockThreshold})
          </div>
          <div className="text-2xl font-bold">{summary.lowStockCount}</div>
        </div>
        <TopSupplierKPI />
      </div>

      {/* Filtros de reportes */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold">Reportes de ventas</h2>
          <form method="get" className="flex items-center gap-2 text-sm">
            <label className="text-gray-700">Días</label>
            <input
              type="number"
              name="days"
              defaultValue={days}
              className="w-20 border rounded px-2 py-1"
            />
            <label className="text-gray-700">Top</label>
            <input
              type="number"
              name="top"
              defaultValue={topLimit}
              className="w-20 border rounded px-2 py-1"
            />
            <label className="text-gray-700">Low</label>
            <input
              type="number"
              name="low"
              defaultValue={lowLimit}
              className="w-20 border rounded px-2 py-1"
            />
            <label className="text-gray-700">Categoría</label>
            <select name="cat" defaultValue={cat} className="border rounded px-2 py-1">
              <option value="">Todas</option>
              {(categories as any[]).map((c: any) => (
                <option key={c.id} value={c.slug}>{`${'— '.repeat(c.depth || 0)}${c.name}`}</option>
              ))}
            </select>
            <button className="bg-blue-600 text-white px-3 py-1 rounded">Aplicar</button>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <TopSoldPanel />
          </div>
          <div>
            <LeastSoldPanel />
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold">Imprimir inventario</h2>
            <div className="text-xs text-gray-500">
              Filtra productos con movimientos en el rango (si aplica).
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className="px-3 py-1 rounded border"
              target="_blank"
              href={`/api/reports/inventory-stock${reportQs ? `?${reportQs}` : ''}`}
            >
              CSV (Excel)
            </a>
            <a
              className="px-3 py-1 rounded border"
              target="_blank"
              href={`/dashboard/admin/inventario/stock/print${reportQs ? `?${reportQs}` : ''}`}
            >
              Imprimir PDF
            </a>
            <a
              className="px-3 py-1 rounded border"
              target="_blank"
              href="/dashboard/admin/inventario/stock/print"
            >
              Inventario actual
            </a>
          </div>
        </div>
        <form method="get" className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm text-gray-700">Desde</label>
            <input type="date" name="from" defaultValue={from} className="border rounded px-2 py-1 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Hasta</label>
            <input type="date" name="to" defaultValue={to} className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="flex items-end gap-2">
            <button className="bg-blue-600 text-white px-3 py-1 rounded">Aplicar</button>
            <a href="/dashboard/admin/inventario" className="px-3 py-1 rounded border text-gray-700">
              Limpiar
            </a>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <LowStockPanel />
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <RecentMovesPanel />
        </div>
      </div>
    </div>
  );
}


