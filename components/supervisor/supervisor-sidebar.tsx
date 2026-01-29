"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navItems = [
  { name: "Resumen", href: "/dashboard/supervisor", icon: "Home" },
  { name: "Carpintería", href: "/dashboard/supervisor/carpinteria", icon: "Hammer" },
  { name: "Estudio de Diseño", href: "/dashboard/supervisor/estudio", icon: "Briefcase" },
];

const icons: Record<string, React.ReactNode> = {
  Home: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  ),
  Hammer: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M15.7 4.3a1 1 0 010 1.4l-6.04 6.04-2.12-.7-1.4 1.4 1.4 1.4-1.4 1.41 2.83 2.82 6.36-6.36a1 1 0 011.42 0l1.41 1.41a1 1 0 010 1.41l-3.54 3.54 1.41 1.41-3.54 3.54a1 1 0 01-1.41 0l-5.66-5.66c-.39-.38-1.02-.38-1.41 0l-1.83 1.83a1 1 0 01-1.41 0l-1.41-1.41a1 1 0 010-1.41l1.83-1.83c.39-.39.39-1.02 0-1.41l-1.41-1.41a1 1 0 010-1.41l1.41-1.41a1 1 0 011.41 0l1.83 1.83c.39.39 1.02.39 1.41 0l5.66-5.66a1 1 0 011.41 0l3 3z" />
    </svg>
  ),
  Briefcase: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M8 2a2 2 0 012-2h0a2 2 0 012 2h2a2 2 0 012 2v2H4V4a2 2 0 012-2h2zM3 8h14a1 1 0 011 1v7a2 2 0 01-2 2H4a2 2 0 01-2-2v-7a1 1 0 011-1z" />
    </svg>
  ),
  LogOut: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 3a1 1 0 011-1h6a1 1 0 010 2H5v12h5a1 1 0 010 2H4a1 1 0 01-1-1V3zm10.293 4.293a1 1 0 011.414 0L18 9.586a1 1 0 010 1.414l-2.293 2.293a1 1 0 01-1.414-1.414L14.586 11H8a1 1 0 010-2h6.586l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  ),
};

export default function SupervisorSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-white p-4">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-600 font-semibold">Supervisor</div>
        <div className="text-sm text-gray-600">Proyectos Carpintería + Diseño</div>
      </div>
      <nav className="flex flex-col gap-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {icons[item.icon]}
              <span>{item.name}</span>
            </Link>
          );
        })}
        <hr className="my-3" />
        <button
          onClick={() => signOut({ callbackUrl: '/auth/login' })}
          className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          {icons.LogOut}
          <span>Cerrar Sesión</span>
        </button>
      </nav>
    </aside>
  );
}
