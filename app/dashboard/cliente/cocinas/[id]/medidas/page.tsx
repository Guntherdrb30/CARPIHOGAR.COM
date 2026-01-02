import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Link from "next/link";

export default async function MedidasCocinaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const { id } = await params;

  if (!userId) {
    return <div className="p-4">Debes iniciar sesion para continuar.</div>;
  }

  const design = await (prisma as any).kitchenDesign.findFirst({
    where: { id, userId },
  });

  if (!design) {
    return (
      <div className="p-4 space-y-3">
        <div>No se encontro el diseno solicitado.</div>
        <Link href="/dashboard/cliente/cocinas" className="text-blue-600 hover:underline">
          Volver a Mis Disenos de Cocina
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Medidas del espacio</h1>
        <p className="text-sm text-gray-600">
          Paso 2 del diseñador. Aqui definiremos las medidas del espacio de cocina.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="text-sm text-gray-700">
          Diseno: <span className="font-semibold">{design.name}</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Layout: {String(design.layoutType).replace(/_/g, " ")}
        </div>
        <div className="mt-3 text-sm text-gray-600">
          Proximamente: formulario de medidas y plano del espacio.
        </div>
        <div className="mt-4">
          <Link
            href={`/dashboard/cliente/cocinas/${design.id}/modulos`}
            className="inline-flex items-center px-3 py-1.5 rounded bg-gray-900 text-white text-sm"
          >
            Continuar a seleccion de modulos
          </Link>
        </div>
      </div>

      <Link href="/dashboard/cliente/cocinas" className="text-blue-600 hover:underline text-sm">
        Volver a Mis Disenos de Cocina
      </Link>
    </div>
  );
}
