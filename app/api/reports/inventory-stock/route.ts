import { NextResponse } from 'next/server';
import { getInventoryStockReport } from '@/server/actions/inventory';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  const data = await getInventoryStockReport({ from, to });
  const lines = [
    ['Codigo','Producto','Descripcion','Proveedor','Cantidad','PrecioUSD','TotalUSD'],
    ...data.rows.map((r) => [
      r.code,
      r.name,
      r.description,
      r.supplier,
      String(r.stock),
      r.priceUSD.toFixed(2),
      r.totalUSD.toFixed(2),
    ]),
    [],
    ['TOTAL', '', '', '', '', '', data.totalValueUSD.toFixed(2)],
  ];
  const csv = lines.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const filename = `inventario_${Date.now()}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename=${filename}`,
    },
  });
}
