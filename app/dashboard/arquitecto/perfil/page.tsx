import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function ArchitectProfilePage() {
  const session = await getServerSession(authOptions);
  const name = String(session?.user?.name || "Arquitecto");
  const email = String(session?.user?.email || "");
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h1 className="text-xl font-semibold text-gray-900">Mi Perfil</h1>
      <div className="mt-4 space-y-2 text-sm text-gray-700">
        <div>
          <span className="font-semibold text-gray-900">Nombre:</span> {name}
        </div>
        <div>
          <span className="font-semibold text-gray-900">Email:</span> {email || "-"}
        </div>
        <div>
          <span className="font-semibold text-gray-900">Rol:</span> ARCHITECTO
        </div>
      </div>
    </div>
  );
}
