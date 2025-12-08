import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { redirect } from 'next/navigation';

type SearchParams = { q?: string; sort?: string };

export const dynamic = 'force-dynamic';

export default async function DeliveryAdminDashboard({ searchParams }: { searchParams?: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'ADMIN') {
    redirect('/auth/login?callbackUrl=/dashboard/admin/delivery/dashboard');
  }

  const sp = (searchParams || {}) as SearchParams;
  const q = String(sp.q || '').trim();
  const sortParam = String(sp.sort || 'ganancias').toLowerCase();
  const sortBy: 'ganancias' | 'rating' | 'entregas' | 'propinas' =
    sortParam === 'rating' || sortParam === 'entregas' || sortParam === 'propinas'
      ? (sortParam as any)
      : 'ganancias';

  const users = await prisma.user.findMany({
    where: {
      role: 'DELIVERY' as any,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } as any },
              { email: { contains: q, mode: 'insensitive' } as any },
              { phone: { contains: q, mode: 'insensitive' } as any },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      payoutBankName: true,
      payoutBankAccount: true,
      payoutBankIdNumber: true,
      payoutPmBank: true,
      payoutPmPhone: true,
      payoutPmIdNumber: true,
      deliveriesAssigned: {
        where: { carrier: 'DELIVERY' as any, status: 'ENTREGADO' as any },
        select: {
          deliveryFeeUSD: true,
          tipUSD: true,
          clientRating: true,
          deliveryPaidAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  });

  type Row = {
    id: string;
    name: string;
    email: string;
    phone: string;
    deliveries: number;
    totalFee: number;
    totalTips: number;
    avgRating: number | null;
    lastDeliveryAt: Date | null;
    pendingFee: number;
    pendingDriverFee: number;
    payoutProfileComplete: boolean;
  };

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const driverPctRaw = (settings as any)?.deliveryDriverSharePct;
  const driverPct = (() => {
    const n = Number(driverPctRaw);
    if (!isFinite(n) || n <= 0 || n > 100) return 70;
    return n;
  })();
  const driverFactor = driverPct / 100;

  const rows: Row[] = users.map((u) => {
    const shipments = u.deliveriesAssigned as any[];
    let totalFee = 0;
    let totalTips = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    let lastDeliveryAt: Date | null = null;
    let pendingFee = 0;

    for (const s of shipments) {
      const fee = parseFloat(String(s.deliveryFeeUSD || 0));
      const tip = parseFloat(String(s.tipUSD || 0));
      totalFee += fee;
      totalTips += tip;
      if (typeof s.clientRating === 'number') {
        ratingSum += Number(s.clientRating);
        ratingCount += 1;
      }
      const upd = s.updatedAt ? new Date(s.updatedAt as any) : null;
      if (upd && (!lastDeliveryAt || upd > lastDeliveryAt)) {
        lastDeliveryAt = upd;
      }
      if (!s.deliveryPaidAt) {
        pendingFee += fee;
      }
    }

    const avgRating = ratingCount > 0 ? ratingSum / ratingCount : null;
    const payoutProfileComplete =
      !!u.payoutBankName &&
      !!u.payoutBankAccount &&
      !!u.payoutBankIdNumber &&
      !!u.payoutPmBank &&
      !!u.payoutPmPhone &&
      !!u.payoutPmIdNumber;

    return {
      id: u.id,
      name: u.name || '',
      email: u.email,
      phone: u.phone || '',
      deliveries: shipments.length,
      totalFee,
      totalTips,
      avgRating,
      lastDeliveryAt,
      pendingFee,
      pendingDriverFee: pendingFee * driverFactor,
      payoutProfileComplete,
    };
  });

  const totalDeliveries = rows.reduce((acc, r) => acc + r.deliveries, 0);
  const totalFees = rows.reduce((acc, r) => acc + r.totalFee, 0);
  const totalTips = rows.reduce((acc, r) => acc + r.totalTips, 0);

  const ratedRows = rows.filter((r) => r.avgRating != null);
  const globalAvgRating =
    ratedRows.length > 0
      ? ratedRows.reduce((acc, r) => acc + (r.avgRating || 0), 0) / ratedRows.length
      : null;

  rows.sort((a, b) => {
    if (sortBy === 'ganancias') {
      const ea = a.totalFee + a.totalTips;
      const eb = b.totalFee + b.totalTips;
      return eb - ea;
    }
    if (sortBy === 'rating') {
      const ra = a.avgRating ?? 0;
      const rb = b.avgRating ?? 0;
      return rb - ra;
    }
    if (sortBy === 'entregas') {
      return b.deliveries - a.deliveries;
    }
    if (sortBy === 'propinas') {
      return b.totalTips - a.totalTips;
    }
    return 0;
  });

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Delivery</h1>
          <p className="text-sm text-gray-600">
            Ranking de repartidores, estadísticas de entregas, propinas y estado de perfil de pago.
          </p>
        </div>
      </div>

      <form
        method="get"
        className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
      >
        <div>
          <label className="block text-xs text-gray-600 mb-1">Buscar delivery</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Nombre, email o teléfono"
            className="border rounded px-2 py-1 w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Ordenar por</label>
          <select
            name="sort"
            defaultValue={sortBy}
            className="border rounded px-2 py-1 w-full text-sm"
          >
            <option value="ganancias">Ganancias (envíos + propinas)</option>
            <option value="rating">Valoración promedio</option>
            <option value="entregas">Cantidad de entregas</option>
            <option value="propinas">Total de propinas</option>
          </select>
        </div>
        <div className="md:col-span-2 flex gap-2">
          <button className="px-3 py-2 rounded bg-blue-600 text-white text-sm w-full md:w-auto">
            Aplicar filtros
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Total deliveries</div>
          <div className="text-2xl font-bold">{rows.length}</div>
          <div className="text-xs text-gray-500">Con rol DELIVERY</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Entregas completadas</div>
          <div className="text-2xl font-bold">{totalDeliveries}</div>
          <div className="text-xs text-gray-500">En Barinas con DELIVERY</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Ganado por envíos</div>
          <div className="text-2xl font-bold">${totalFees.toFixed(2)}</div>
          <div className="text-xs text-gray-500">Fee base de plataforma</div>
        </div>
        <div className="bg-white rounded shadow p-4">
          <div className="text-xs text-gray-500">Propinas totales</div>
          <div className="text-2xl font-bold">${totalTips.toFixed(2)}</div>
          <div className="text-xs text-gray-500">
            {globalAvgRating != null
              ? `Rating promedio: ${globalAvgRating.toFixed(2)} / 5`
              : 'Sin valoraciones aún'}
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="px-3 py-2">Delivery</th>
              <th className="px-3 py-2">Contacto</th>
              <th className="px-3 py-2 text-right">Entregas</th>
              <th className="px-3 py-2 text-right">Envíos (USD)</th>
              <th className="px-3 py-2 text-right">Propinas (USD)</th>
              <th className="px-3 py-2 text-right">Rating</th>
              <th className="px-3 py-2">Última entrega</th>
              <th className="px-3 py-2 text-right">Pendiente pagar</th>
              <th className="px-3 py-2">Perfil pago</th>
              <th className="px-3 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-gray-900">{r.name || r.email}</div>
                  <div className="text-xs text-gray-500">{r.id.slice(0, 8)}</div>
                </td>
                <td className="px-3 py-2 align-top text-xs text-gray-700">
                  <div>{r.email}</div>
                  {r.phone && <div className="text-gray-500">Tel: {r.phone}</div>}
                </td>
                <td className="px-3 py-2 align-top text-right">{r.deliveries}</td>
                <td className="px-3 py-2 align-top text-right">
                  ${r.totalFee.toFixed(2)}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  ${r.totalTips.toFixed(2)}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  {r.avgRating != null ? `${r.avgRating.toFixed(2)} / 5` : '—'}
                </td>
                <td className="px-3 py-2 align-top text-xs text-gray-600">
                  {r.lastDeliveryAt
                    ? new Date(r.lastDeliveryAt).toLocaleString('es-VE')
                    : 'Sin entregas'}
                </td>
                <td className="px-3 py-2 align-top text-right">
                  ${r.pendingFee.toFixed(2)}
                </td>
                <td className="px-3 py-2 align-top text-xs">
                  {r.payoutProfileComplete ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      Completo
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Incompleto
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-center text-xs">
                  <a
                    href={`/dashboard/admin/delivery/liquidaciones?user=${encodeURIComponent(
                      r.id,
                    )}`}
                    className="inline-flex items-center justify-center rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                  >
                    Pagar a delivery
                  </a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-4 text-center text-sm text-gray-600"
                >
                  No hay repartidores que coincidan con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
