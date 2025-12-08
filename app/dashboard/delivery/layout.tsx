import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DeliveryLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/auth/login?callbackUrl=/dashboard/delivery');
  if ((session.user as any)?.role !== 'DELIVERY') {
    redirect('/auth/login?message=You Are Not Authorized!');
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <a className="px-3 py-1.5 rounded border hover:bg-gray-50" href="/dashboard/delivery">
          Pendientes
        </a>
        <a className="px-3 py-1.5 rounded border hover:bg-gray-50" href="/dashboard/delivery/historial">
          Entregadas
        </a>
        <a className="px-3 py-1.5 rounded border hover:bg-gray-50" href="/dashboard/delivery/ganancias">
          Ganancias
        </a>
        <a className="px-3 py-1.5 rounded border hover:bg-gray-50" href="/dashboard/delivery/perfil">
          Perfil de pagos
        </a>
      </div>
      {children}
    </div>
  );
}

