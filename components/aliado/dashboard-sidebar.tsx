'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

const navItems = [
  // Aliado core
  { name: 'Presupuestos', href: '/dashboard/aliado/presupuestos', icon: 'Clipboard' },
  { name: 'Reportes', href: '/dashboard/aliado/reportes', icon: 'Chart' },
  { name: 'Resumen', href: '/dashboard/aliado', icon: 'Home' },
  { name: 'Mi Perfil (Aliado)', href: '/dashboard/aliado/perfil', icon: 'User' },
  // Cliente shortcuts
  { name: 'Mis Pedidos (Cliente)', href: '/dashboard/cliente/pedidos', icon: 'Package' },
  { name: 'Mis Favoritos (Cliente)', href: '/dashboard/cliente/favoritos', icon: 'Heart' },
  { name: 'Mis Direcciones (Cliente)', href: '/dashboard/cliente/direcciones', icon: 'MapPin' },
];

// Simple SVG icons as placeholders
const icons: { [key: string]: React.ReactNode } = {
  Home: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>,
  Clipboard: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 00-1 1v1H6a2 2 0 00-2 2v9a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2h-2V3a1 1 0 00-1-1H9z"/></svg>,
  Cash: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v4H0V6zm0 6h18v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2z"/></svg>,
  Chart: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3a1 1 0 000 2h1v12a1 1 0 102 0V5h2v10a1 1 0 102 0V5h2v6a1 1 0 102 0V5h2v12a1 1 0 102 0V5h1a1 1 0 100-2H3z"/></svg>,
  Package: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4z" clipRule="evenodd" /></svg>,
  Heart: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" /></svg>,
  MapPin: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 20l-4.95-5.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>,
  User: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>,
  LogOut: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V5h10a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 6.707 6.293a1 1 0 00-1.414 1.414L8.586 11l-3.293 3.293a1 1 0 101.414 1.414L10 12.414l3.293 3.293a1 1 0 001.414-1.414L11.414 10l3.293-3.293z" clipRule="evenodd" /></svg>,
  Plus: <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/></svg>,
};

export function AllyDashboardSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-4">
      <nav className="flex flex-col space-y-2">
        <Link
          href="/dashboard/aliado/presupuestos/nuevo"
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700"
        >
          {icons['Plus']} <span>Nuevo Presupuesto</span>
        </Link>
        <hr className="my-2" />
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              {icons[item.icon]}
              <span>{item.name}</span>
            </Link>
          );
        })}
        <hr className="my-4" />
        <button onClick={() => signOut({ callbackUrl: '/auth/login' })} className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
          {icons['LogOut']}
          <span>Cerrar Sesion</span>
        </button>
      </nav>
    </aside>
  );
}
