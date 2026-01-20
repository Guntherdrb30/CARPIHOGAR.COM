'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

const navItems = [
  { name: 'Mi Dashboard', href: '/dashboard/arquitecto', icon: 'Home' },
  { name: 'Estudio de Diseno', href: '/dashboard/arquitecto/estudio', icon: 'Briefcase' },
  { name: 'Mis Proyectos', href: '/dashboard/arquitecto/proyectos', icon: 'Folder' },
  { name: 'Calendario', href: '/dashboard/arquitecto/calendario', icon: 'Calendar' },
  { name: 'Archivos', href: '/dashboard/arquitecto/archivos', icon: 'File' },
  { name: 'Mi Perfil', href: '/dashboard/arquitecto/perfil', icon: 'User' },
];

const icons: { [key: string]: React.ReactNode } = {
  Home: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  ),
  Briefcase: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6 5a2 2 0 012-2h4a2 2 0 012 2v1h2a1 1 0 011 1v3H3V7a1 1 0 011-1h2V5zm2 0v1h4V5H8zM3 11h14v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4z" />
    </svg>
  ),
  Folder: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 5a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
    </svg>
  ),
  Calendar: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6 2a1 1 0 011 1v1h6V3a1 1 0 112 0v1h1a2 2 0 012 2v2H2V6a2 2 0 012-2h1V3a1 1 0 011-1zm12 8H2v6a2 2 0 002 2h12a2 2 0 002-2v-6z" />
    </svg>
  ),
  File: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.5L13.5 2H4zm9 1.5L17.5 8H13a1 1 0 01-1-1V3.5z" />
    </svg>
  ),
  User: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  ),
  LogOut: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V5h10a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 6.707 6.293a1 1 0 00-1.414 1.414L8.586 11l-3.293 3.293a1 1 0 101.414 1.414L10 12.414l3.293 3.293a1 1 0 001.414-1.414L11.414 11l3.293-3.293z" clipRule="evenodd" />
    </svg>
  ),
};

export function ArchitectDashboardSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-4">
      <nav className="flex flex-col space-y-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {icons[item.icon]}
              <span>{item.name}</span>
            </Link>
          );
        })}
        <hr className="my-4" />
        <button
          onClick={() => signOut({ callbackUrl: '/auth/login' })}
          className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900 w-full text-left"
        >
          {icons['LogOut']}
          <span>Cerrar Sesion</span>
        </button>
      </nav>
    </aside>
  );
}
