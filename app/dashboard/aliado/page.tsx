import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { getAllyKpis } from "@/server/actions/ally";

export default async function AliadoHomePage() {
  const session = await getServerSession(authOptions);
  const name = (session?.user?.name || session?.user?.email || '').split(' ')[0];
  const kpis = await getAllyKpis();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Hola, {name}</h1>
        <p className="text-gray-600">Bienvenido al panel de Aliado. Administra tus presupuestos y reportes.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-gray-500">Ventas Totales</div>
          <div className="text-2xl font-semibold">${kpis.totalRevenueUSD.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-gray-500">Ganancia Estimada</div>
          <div className="text-2xl font-semibold">${kpis.totalProfitUSD.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="text-sm text-gray-500">Ventas Realizadas</div>
          <div className="text-2xl font-semibold">{kpis.ordersCount}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/dashboard/aliado/presupuestos" className="bg-brand text-white rounded-lg p-4 text-center hover:bg-opacity-90">Gestionar Presupuestos</Link>
        <Link href="/dashboard/aliado/reportes" className="bg-black text-white rounded-lg p-4 text-center">Ver Reportes</Link>
      </div>
      <div className="text-sm text-gray-600">
        También puedes acceder a tu panel de cliente: <Link href="/dashboard/cliente" className="text-brand underline">Mi Cuenta</Link>
      </div>
    </div>
  );
}

