import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';

export default async function RootHomePage() {
  const session = await getServerSession(authOptions as any);
  const email = String((session?.user as any)?.email || '').toLowerCase();
  const role = String((session?.user as any)?.role || '');
  const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
  const isRoot = role === 'ADMIN' && email === rootEmail;

  if (!isRoot) {
    return (
      <div className="container mx-auto p-4">
        <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">
          No autorizado.
        </div>
      </div>
    );
  }

  const cards = [
    {
      title: 'Zona de productos sin IVA',
      description:
        'Crea referencias marcadas como “vender sin IVA”. Solo el root puede ver y activar este flag.',
      href: '/dashboard/admin/root/productos',
      action: 'Crear productos',
    },
    {
      title: 'Ventas ocultas (solo root)',
      description:
        'Genera notas de entrega sin IVA y controla estas ventas en un registro aparte del ERP.',
      href: '/dashboard/admin/root/ventas',
      action: 'Abrir ventas root',
    },
  ];

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <p className="text-sm uppercase text-gray-500">Root</p>
        <h1 className="text-3xl font-bold">Panel oculto del root</h1>
        <p className="text-gray-600 mt-2 max-w-3xl">
          Esta sección sólo aparece para el usuario master configurado en <code>ROOT_EMAIL</code>. Desde
          aquí puedes crear productos con la bandera “vender sin IVA” y procesar ventas que generan
          únicamente nota de entrega, fuera del registro principal del ERP.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card) => (
          <div key={card.href} className="p-4 rounded-lg border bg-white shadow-sm">
            <h2 className="text-xl font-semibold">{card.title}</h2>
            <p className="text-gray-600 mt-1">{card.description}</p>
            <Link
              href={card.href}
              className="inline-flex items-center gap-2 mt-4 px-3 py-2 rounded bg-slate-900 text-white text-sm"
            >
              {card.action}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
