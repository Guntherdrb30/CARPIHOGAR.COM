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
  const [openSections, setOpenSections] = React.useState<Set<string>>(() => new Set(["Administración"]));

  type SectionItem = {
    href: string;
    label: string;
    badgeValue?: number;
    badgeColor?: "red" | "amber";
  };
  type Section = {
    label: string;
    items: SectionItem[];
  };

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

  const toggleSection = (label: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const ajustesItems: SectionItem[] = [
    { href: '/dashboard/admin/ajustes', label: 'Ajustes' },
    ...(isAdmin ? [{ href: '/dashboard/settings/courses', label: 'Cursos (IA)' }] : []),
    ...(isRoot
      ? [
          { href: '/dashboard/admin/ajustes/sistema', label: 'Ajustes del Sistema (Root)' },
          { href: '/dashboard/admin/root/productos', label: 'Root: Productos sin IVA' },
          { href: '/dashboard/admin/root/ventas', label: 'Root: Ventas sin IVA' },
          { href: '/dashboard/admin/root', label: 'Root (panel oculto)' },
        ]
      : []),
  ];

  const sections: Section[] = [
    {
      label: 'Administración',
      items: [
        { href: '/dashboard/admin/notificaciones', label: 'Notificaciones', badgeValue: incompleteProducts, badgeColor: 'amber' },
        { href: '/dashboard/admin/ventas/nueva', label: 'Nueva Venta' },
        { href: '/dashboard/admin/ventas', label: 'Ventas', badgeValue: salesPending, badgeColor: 'red' },
        { href: '/dashboard/admin/ventas/aliados', label: 'Ventas Aliados (verificar)', badgeValue: allyPending, badgeColor: 'red' },
        { href: '/dashboard/admin/usuarios', label: 'Usuarios', badgeValue: usersPending, badgeColor: 'red' },
        { href: '/dashboard/admin/inventario', label: 'Inventario' },
        { href: '/dashboard/admin/inventario/valuacion', label: 'Valuación' },
        { href: '/dashboard/admin/inventario/valuacion/por-proveedor', label: 'Val. por proveedor' },
        { href: '/dashboard/admin/inventario/productos-por-proveedor', label: 'Productos por proveedor' },
      ],
    },
    {
      label: 'Contabilidad',
      items: [
        { href: '/dashboard/admin/cuentas-por-pagar', label: 'Cuentas por Pagar' },
        { href: '/dashboard/admin/cuentas-por-cobrar', label: 'Cuentas por Cobrar' },
        { href: '/dashboard/admin/bancos', label: 'Bancos' },
      ],
    },
    {
      label: 'Compras',
      items: [
        { href: '/dashboard/admin/compras', label: 'Compras' },
      ],
    },
    {
      label: 'Pagos',
      items: [
        { href: '/dashboard/admin/nomina', label: 'Nomina' },
        { href: '/dashboard/admin/comisiones', label: 'Comisiones' },
        { href: '/dashboard/admin/delivery/liquidaciones', label: 'Liquidaciones Delivery' },
      ],
    },
    {
      label: 'Proveedores',
      items: [
        { href: '/dashboard/admin/proveedores', label: 'Proveedores' },
      ],
    },
    {
      label: 'Tienda Online',
      items: [
        { href: '/dashboard/admin/productos', label: 'Productos' },
        { href: '/dashboard/admin/categorias', label: 'Categorias' },
        { href: '/dashboard/admin/usuarios?scope=tienda', label: 'Usuarios (Tienda)' },
      ],
    },
    {
      label: 'Ajustes',
      items: ajustesItems,
    },
    {
      label: 'Envios',
      items: [
        { href: '/dashboard/admin/envios', label: 'Envios' },
        { href: '/dashboard/admin/envios/online', label: 'Envios Online' },
        { href: '/dashboard/admin/envios/tienda', label: 'Envios en Tienda' },
        { href: '/dashboard/admin/delivery/solicitudes', label: 'Delivery (solicitudes)' },
        { href: '/dashboard/admin/delivery/dashboard', label: 'Delivery (dashboard)' },
        { href: '/dashboard/admin/envios/logs', label: 'Logs de Envios' },
      ],
    },
    {
      label: 'Reportes',
      items: [
        { href: '/dashboard/admin/reportes', label: 'Reportes' },
      ],
    },
    {
      label: 'Mensajería',
      items: [
        { href: '/dashboard/admin/mensajeria', label: 'Mensajería' },
      ],
    },
    {
      label: 'Carpintería',
      items: [
        { href: '/dashboard/admin/carpinteria', label: 'Proyectos de Carpintería' },
        { href: '/dashboard/admin/estudio', label: 'Estudio de Diseño Interior' },
        { href: '/dashboard/admin/estudio/nuevo', label: 'Nuevo proyecto de diseño' },
      ],
    },
  ];

  const renderBadge = (item: SectionItem) => {
    if (!item.badgeValue || item.badgeValue <= 0) return null;
    const color = item.badgeColor === 'amber' ? 'bg-amber-600' : 'bg-red-600';
    return (
      <span
        className={`ml-1 inline-flex items-center justify-center rounded-full text-[11px] px-1.5 min-w-[1.25rem] text-white ${color}`}
      >
        {item.badgeValue}
      </span>
    );
  };


  return (
    <aside className="w-56 xl:w-60 shrink-0 border-r bg-white min-h-[calc(100vh-64px)] print:hidden">
      <nav className="p-3 text-sm max-h-[calc(100vh-64px)] overflow-y-auto space-y-3">
        {sections.map((section) => {
          const isOpen = openSections.has(section.label);
          return (
            <div key={section.label} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleSection(section.label)}
                className="flex items-center justify-between w-full rounded-md px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              >
                <span>{section.label}</span>
                <span className="text-xs font-bold">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div className="space-y-1 pl-3">
                  {section.items.map((item) => {
                    const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          active ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span>{item.label}</span>
                          {renderBadge(item)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
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
