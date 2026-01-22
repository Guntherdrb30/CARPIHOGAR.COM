'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { signOut } from 'next-auth/react';

export default function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const email = String((session?.user as any)?.email || '').toLowerCase();
  const role = String((session?.user as any)?.role || '');
  const rootEmail = String(process.env.NEXT_PUBLIC_ROOT_EMAIL || process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
  const isAdmin = role === 'ADMIN';
  const isRoot = isAdmin && email === rootEmail;
  const [allyPending, setAllyPending] = React.useState(0);
  const [salesPending, setSalesPending] = React.useState(0);
  const [unreadMsgs, setUnreadMsgs] = React.useState(0);
  const [usersPending, setUsersPending] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    fetch('/api/admin/ally-pending-count')
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => {
        if (active && typeof d?.count === 'number') setAllyPending(d.count);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Ventas (todas) con pago por revisar
  React.useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetch('/api/admin/pending-sales-count')
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => {
        if (alive && typeof d?.count === 'number') setSalesPending(d.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  // Poll unread messages for Mensajería
  React.useEffect(() => {
    let alive = true;
    let t: any;
    const tick = async () => {
      try {
        const r = await fetch('/api/messaging/unread', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        const n = Number(j?.unread || 0);
        setUnreadMsgs(isNaN(n) ? 0 : n);
      } catch {}
      t = setTimeout(tick, 15000);
    };
    tick();
    return () => { alive = false; if (t) clearTimeout(t); };
  }, []);

  // Usuarios con estados pendientes (aliados o delivery por revisar)
  React.useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetch('/api/admin/pending-users-count')
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => {
        if (alive && typeof d?.count === 'number') setUsersPending(d.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const links = [
    { href: '/dashboard/admin', label: 'Resumen' },
    { href: '/dashboard/admin/estudio', label: 'Estudio de Diseno' },
    { href: '/dashboard/admin/productos', label: 'Productos' },
    { href: '/dashboard/admin/productos/configurables', label: 'Configurables (ECPD)' },
    { href: '/dashboard/admin/categorias', label: 'Categorías' },
    { href: '/dashboard/admin/ventas', label: 'Ventas' },
    { href: '/dashboard/admin/comisiones', label: 'Comisiones' },
    { href: '/dashboard/admin/ventas/aliados', label: 'Ventas Aliados (verificar)' },
    { href: '/dashboard/admin/delivery/solicitudes', label: 'Delivery (verificar)' },
    { href: '/dashboard/admin/delivery/dashboard', label: 'Delivery (dashboard)' },
    { href: '/dashboard/admin/delivery/liquidaciones', label: 'Liquidaciones Delivery' },
    { href: '/dashboard/admin/cuentas-por-cobrar', label: 'Cuentas por Cobrar' },
    { href: '/dashboard/admin/cuentas-por-pagar', label: 'Cuentas por Pagar' },
    { href: '/dashboard/admin/inventario', label: 'Inventario' },
    { href: '/dashboard/admin/inventario/valuacion', label: 'Valuación' },
    { href: '/dashboard/admin/inventario/valuacion/por-proveedor', label: 'Val. por Proveedor' },
    { href: '/dashboard/admin/inventario/productos-por-proveedor', label: 'Prod. por Proveedor' },
    { href: '/dashboard/admin/ventas/nueva', label: 'Nueva Venta' },
    { href: '/dashboard/admin/presupuestos', label: 'Presupuestos' },
    { href: '/dashboard/admin/compras', label: 'Compras' },
    { href: '/dashboard/admin/proveedores', label: 'Proveedores' },
    { href: '/dashboard/admin/bancos', label: 'Bancos' },
    { href: '/dashboard/admin/sucursales', label: 'Sucursales' },
    { href: '/dashboard/admin/usuarios', label: 'Usuarios' },
    { href: '/dashboard/admin/envios', label: 'Envíos' },
    { href: '/dashboard/admin/envios/online', label: 'Envíos Online' },
    { href: '/dashboard/admin/envios/tienda', label: 'Envíos en Tienda' },
    { href: '/dashboard/admin/ajustes', label: 'Ajustes' },
    // Cursos (IA) - sólo visible para ADMIN/ROOT
    ...(isAdmin ? [{ href: '/dashboard/settings/courses', label: 'Cursos (IA)' }] : []),
    { href: '/dashboard/admin/envios/logs', label: 'Logs de Envios' },
    ...(isRoot
      ? [
          { href: '/dashboard/admin/root', label: 'Root (panel oculto)' },
          { href: '/dashboard/admin/root/productos', label: 'Root: Productos sin IVA' },
          { href: '/dashboard/admin/root/ventas', label: 'Root: Ventas sin IVA' },
          { href: '/dashboard/admin/ajustes/sistema', label: 'Ajustes del Sistema (Root)' },
        ]
      : []),
    { href: '/dashboard/admin/reportes', label: 'Reportes' },
    { href: '/dashboard/admin/mensajeria', label: 'Mensajería' },
  ];

  return (
    <aside className="w-56 xl:w-60 shrink-0 border-r bg-white min-h-[calc(100vh-64px)] print:hidden">
      <nav className="p-3 space-y-1 text-sm max-h-[calc(100vh-64px)] overflow-y-auto">
        {links.map((l) => {
          const active = pathname === l.href || pathname?.startsWith(l.href + '/');
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span>{l.label}</span>
                {l.href === '/dashboard/admin/ventas' && salesPending > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] px-1.5 min-w-[1.25rem]">
                    {salesPending}
                  </span>
                )}
                {l.href === '/dashboard/admin/ventas/aliados' && allyPending > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] px-1.5 min-w-[1.25rem]">
                    {allyPending}
                  </span>
                )}
                {l.href === '/dashboard/admin/mensajeria' && unreadMsgs > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] px-1.5 min-w-[1.25rem]">
                    {unreadMsgs}
                  </span>
                )}
                {l.href === '/dashboard/admin/usuarios' && usersPending > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] px-1.5 min-w-[1.25rem]">
                    {usersPending}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
        <hr className="my-3" />
        <button
          onClick={() => signOut({ callbackUrl: '/auth/login' })}
          className="w-full text-left block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          Cerrar Sesión
        </button>
      </nav>
    </aside>
  );
}
