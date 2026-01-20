"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "ADMIN" | "ARCHITECTO";

const icons: Record<string, React.ReactNode> = {
  Studio: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 3a2 2 0 00-2 2v11a1 1 0 001 1h14a1 1 0 001-1V5a2 2 0 00-2-2H4zm0 2h12v2H4V5zm0 4h12v7H4V9z" />
    </svg>
  ),
  Plus: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
    </svg>
  ),
  Report: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L13 1.586A2 2 0 0011.586 1H4zm8 1.5L16.5 9H12a1 1 0 01-1-1V4.5z" />
    </svg>
  ),
  Exit: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V5h10a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586l-2.293-2.293a1 1 0 00-1.414 1.414L8.586 11l-2.293 2.293a1 1 0 101.414 1.414L10 12.414l2.293 2.293a1 1 0 001.414-1.414L11.414 11l3.293-3.293z" clipRule="evenodd" />
    </svg>
  ),
};

export default function DesignStudioSidebar({
  role,
  userId,
}: {
  role: Role;
  userId?: string;
}) {
  const pathname = usePathname();
  const base = role === "ADMIN" ? "/dashboard/admin/estudio" : "/dashboard/arquitecto/estudio";
  const exitHref = role === "ADMIN" ? "/dashboard/admin" : "/dashboard/arquitecto";
  const items = [
    { name: "Estudio de Diseno", href: base, icon: "Studio" },
    ...(role === "ADMIN"
      ? [{ name: "Nuevo proyecto", href: `${base}/nuevo`, icon: "Plus" }]
      : []),
  ];

  const reportLinks = role === "ADMIN"
    ? [{ name: "Reporte semanal (PDF)", href: "/api/reports/design/weekly/pdf?includeAmounts=1", icon: "Report" }]
    : userId
      ? [{ name: "Mi reporte (PDF)", href: `/api/reports/design/architect/${userId}/pdf?includeAmounts=0`, icon: "Report" }]
      : [];

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-white p-4">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-[0.2em] text-red-600 font-semibold">Trends172</div>
        <div className="text-sm text-gray-600">Estudio de Diseno Interior</div>
      </div>
      <nav className="flex flex-col space-y-2">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-red-50 text-red-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {icons[item.icon]}
              <span>{item.name}</span>
            </Link>
          );
        })}
        {reportLinks.length > 0 && <hr className="my-3" />}
        {reportLinks.map((item) => (
          <a
            key={item.name}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            {icons[item.icon]}
            <span>{item.name}</span>
          </a>
        ))}
        <hr className="my-3" />
        <Link
          href={exitHref}
          className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          {icons.Exit}
          <span>Salir del estudio</span>
        </Link>
      </nav>
    </aside>
  );
}
