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
  const [incompleteProducts, setIncompleteProducts] = React.useState(0);

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

  React.useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetch('/api/admin/incomplete-products-count')
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => {
        if (alive && typeof d?.count === 'number') setIncompleteProducts(d.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const links = [
    { href: '/dashboard/admin/notificaciones', label: 'Notificaciones' },
    { type: 'header', label: 'Administracion' },
    { href: '/dashboard/admin/ventas/nueva', label: 'Nueva Venta' },
    { href: '/dashboard/admin/ventas', label: 'Ventas' },
    { href: '/dashboard/admin/usuarios', label: 'Usuarios' },
    { type: 'header', label: 'Contabilidad' },
    { href: '/dashboard/admin/cuentas-por-pagar', label: 'Cuentas por Pagar' },
    { href: '/dashboard/admin/cuentas-por-cobrar', label: 'Cuentas por Cobrar' },
    { href: '/dashboard/admin/bancos', label: 'Bancos' },
    { type: 'header', label: 'Compras' },
    { href: '/dashboard/admin/compras', label: 'Compras' },
    { type: 'header', label: 'Pagos' },
    { href: '/dashboard/admin/nomina', label: 'Nomina' },
    { href: '/dashboard/admin/comisiones', label: 'Comisiones' },
    { href: '/dashboard/admin/delivery/liquidaciones', label: 'Liquidaciones Delivery' },
    { type: 'header', label: 'Proveedores' },
    { href: '/dashboard/admin/proveedores', label: 'Proveedores' },
    { type: 'header', label: 'Tienda Online' },
    { href: '/dashboard/admin/productos', label: 'Productos' },
    { href: '/dashboard/admin/categorias', label: 'Categorias' },
    { href: '/dashboard/admin/usuarios?scope=tienda', label: 'Usuarios (Tienda)' },
    { type: 'header', label: 'Ajustes' },
    { href: '/dashboard/admin/ajustes', label: 'Ajustes' },
    ...(isRoot ? [{ href: '/dashboard/admin/ajustes/sistema', label: 'Ajustes del Sistema (Root)' }] : []),
    ...(isRoot ? [{ href: '/dashboard/admin/root/productos', label: 'Root: Productos sin IVA' }] : []),
    ...(isRoot ? [{ href: '/dashboard/admin/root/ventas', label: 'Root: Ventas sin IVA' }] : []),
    ...(isRoot ? [{ href: '/dashboard/admin/root', label: 'Root (panel oculto)' }] : []),
    { type: 'header', label: 'Envios' },
    { href: '/dashboard/admin/envios', label: 'Envios' },
    { href: '/dashboard/admin/envios/online', label: 'Envios Online' },
    { href: '/dashboard/admin/envios/tienda', label: 'Envios en Tienda' },
    { type: 'header', label: 'Reportes' },
    { href: '/dashboard/admin/reportes', label: 'Reportes' },
    { type: 'header', label: 'Mensajeria' },
    { href: '/dashboard/admin/mensajeria', label: 'Mensajeria' },
    { type: 'header', label: 'Carpinteria' },
    { href: '/dashboard/admin/carpinteria', label: 'Proyectos de Carpinteria' },
    { href: '/dashboard/admin/estudio', label: 'Estudio de Diseño Interior' },
    { href: '/dashboard/admin/estudio/nuevo', label: 'Nuevo proyecto de diseño' },
    { href: '/dashboard/admin/inventario', label: 'Inventario Carpinteria' },
    { href: '/dashboard/admin/inventario/valuacion', label: 'Valuación del Inventario' },
    { href: '/dashboard/admin/inventario/valuacion/por-proveedor', label: 'Val. por proveedor' },
    { href: '/dashboard/admin/inventario/productos-por-proveedor', label: 'Productos por proveedor' },
  ];


  return (
    <aside className="w-56 xl:w-60 shrink-0 border-r bg-white min-h-[calc(100vh-64px)] print:hidden">
      <nav className="p-3 space-y-1 text-sm max-h-[calc(100vh-64px)] overflow-y-auto">
        {links.map((l: any, idx: number) => {
          if (l.type === 'header') {
            return (
              <div key={`h-${l.label}-${idx}`} className="mt-3 text-[11px] uppercase tracking-wide text-gray-400 px-2">
                {l.label}
              </div>
            );
          }
          const active = pathname === l.href || pathname?.startsWith(l.href + '/');
          return (
            <Link
              key={`${l.href}-${l.label}`}
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
                {(l.href === '/dashboard/admin/usuarios' || l.href === '/dashboard/admin/usuarios?scope=tienda') && usersPending > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] px-1.5 min-w-[1.25rem]">
                    {usersPending}
                  </span>
                )}
                {l.href === '/dashboard/admin/notificaciones' && incompleteProducts > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-600 text-white text-[11px] px-1.5 min-w-[1.25rem]">
                    {incompleteProducts}
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
