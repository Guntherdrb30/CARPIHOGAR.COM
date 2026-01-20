import { getUsers, approveAlly, createAdminUser, createArchitectUser, updateUser, deleteUserByForm, updateUserPasswordByForm, anonymizeUserByForm } from "@/server/actions/users";
import ShowToastFromSearch from '@/components/show-toast-from-search';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PendingButton } from '@/components/pending-button';
import UsersSearch from '@/components/admin/users-search';
import ResendVerificationBtn from '@/components/admin/resend-verification-btn';

export default async function AdminUsersPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const sp = (await searchParams) || ({} as any);
  const q = String(sp.q || '').trim();
  const users = await getUsers(q);
  const session = await getServerSession(authOptions);
  const email = String((session?.user as any)?.email || '').toLowerCase();
  const role = String((session?.user as any)?.role || '');
  const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
  const isRoot = role === 'ADMIN' && email === rootEmail;

  function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function highlight(text: string | null | undefined) {
    const value = String(text || '');
    if (!q) return value;
    try {
      const re = new RegExp(`(${escapeRegExp(q)})`, 'ig');
      const parts = value.split(re);
      return parts.map((part, idx) => (
        re.test(part) ? <span key={idx} className="bg-yellow-200 rounded px-0.5">{part}</span> : <span key={idx}>{part}</span>
      ));
    } catch {
      return value;
    }
  }

  return (
    <div className="container mx-auto p-4">
      <ShowToastFromSearch />
      <h1 className="text-2xl font-bold mb-4">Gestionar Usuarios</h1>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="text-lg font-bold mb-2">Crear usuario Administrador</h2>
        <form action={async (formData) => {
          'use server';
          const name = String(formData.get('name') || '');
          const email = String(formData.get('email') || '');
          const password = String(formData.get('password') || '');
          await createAdminUser(name, email, password);
        }} className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input name="name" placeholder="Nombre" className="border rounded px-2 py-1" required />
          <input type="email" name="email" placeholder="Email" className="border rounded px-2 py-1" required />
          <input type="password" name="password" placeholder="Contrasena" className="border rounded px-2 py-1" required />
          <PendingButton className="bg-blue-600 text-white px-3 py-1 rounded" pendingText="Creando...">Crear Admin</PendingButton>
        </form>
      </div>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="text-lg font-bold mb-2">Crear usuario Vendedor</h2>
        <form action={async (formData) => {
          'use server';
          const name = String(formData.get('seller_name') || '');
          const email = String(formData.get('seller_email') || '');
          const password = String(formData.get('seller_password') || '');
          const commission = formData.get('seller_commission') ? parseFloat(String(formData.get('seller_commission'))) : undefined;
          const { createSellerUser } = await import('@/server/actions/users');
          await createSellerUser(name, email, password, commission);
        }} className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input name="seller_name" placeholder="Nombre" className="border rounded px-2 py-1" required />
          <input type="email" name="seller_email" placeholder="Email" className="border rounded px-2 py-1" required />
          <input type="password" name="seller_password" placeholder="Contrasena" className="border rounded px-2 py-1" required />
          <input type="number" step="0.01" min="0" max="100" name="seller_commission" placeholder="% Comision (opcional)" className="border rounded px-2 py-1" />
          <PendingButton className="bg-green-600 text-white px-3 py-1 rounded" pendingText="Creando...">Crear Vendedor</PendingButton>
        </form>
      </div>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="text-lg font-bold mb-2">Crear usuario Despacho</h2>
        <form action={async (formData) => {
          'use server';
          const name = String(formData.get('dispatch_name') || '');
          const email = String(formData.get('dispatch_email') || '');
          const password = String(formData.get('dispatch_password') || '');
          const { createDispatcherUser } = await import('@/server/actions/users');
          await createDispatcherUser(name, email, password);
        }} className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input name="dispatch_name" placeholder="Nombre" className="border rounded px-2 py-1" required />
          <input type="email" name="dispatch_email" placeholder="Email" className="border rounded px-2 py-1" required />
          <input type="password" name="dispatch_password" placeholder="Contrasena" className="border rounded px-2 py-1" required minLength={8} maxLength={16} title="Entre 8 y 16 caracteres" />
          <PendingButton className="bg-purple-600 text-white px-3 py-1 rounded" pendingText="Creando...">Crear Despacho</PendingButton>
        </form>
      </div>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="text-lg font-bold mb-2">Crear usuario Arquitecto</h2>
        <form action={async (formData) => {
          'use server';
          const name = String(formData.get('architect_name') || '');
          const email = String(formData.get('architect_email') || '');
          const password = String(formData.get('architect_password') || '');
          await createArchitectUser(name, email, password);
        }} className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input name="architect_name" placeholder="Nombre" className="border rounded px-2 py-1" required />
          <input type="email" name="architect_email" placeholder="Email" className="border rounded px-2 py-1" required />
          <input type="password" name="architect_password" placeholder="Contrasena" className="border rounded px-2 py-1" required />
          <PendingButton className="bg-indigo-600 text-white px-3 py-1 rounded" pendingText="Creando...">Crear Arquitecto</PendingButton>
        </form>
      </div>
      {/* Buscador de usuarios */}
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="text-lg font-bold mb-2">Buscar Usuarios</h2>
        <UsersSearch resultCount={users.length} />
      </div>
      <div className="bg-white p-4 rounded-lg shadow mt-4">
        <h2 className="text-lg font-bold mb-2">Todos los Usuarios</h2>
        {q ? (<div className="text-sm text-gray-600 mb-2">Mostrando {users.length} resultado{users.length === 1 ? '' : 's'} para "{q}"</div>) : null}
        <details className="rounded border border-gray-200" open>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">Ver usuarios</summary>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="px-2 py-1 text-left w-48">Nombre</th>
                  <th className="px-2 py-1 text-left w-64">Email</th>
                  <th className="px-2 py-1 text-left w-28">Rol</th>
                  <th className="px-2 py-1 text-left w-32">Estatus</th>
                  <th className="px-2 py-1 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t">
                    <td className="px-2 py-1 align-top">{highlight(user.name)}</td>
                    <td className="px-2 py-1 align-top">{highlight(user.email)}</td>
                    <td className="px-2 py-1 align-top">{user.role}</td>
                    <td className="px-2 py-1 align-top">{user.alliedStatus}</td>
                    <td className="px-2 py-1 align-top">
                      <details>
                        <summary className="cursor-pointer inline-flex items-center gap-1 text-gray-700 hover:text-gray-900">Ver acciones</summary>
                        <div className="mt-2 space-y-2">
                          {user.alliedStatus === "PENDING" && (
                            <form action={async () => { 'use server'; await approveAlly(user.id); }}>
                              <PendingButton className="bg-green-600 text-white px-2 py-1 rounded" pendingText="Aprobando...">Aprobar Aliado</PendingButton>
                            </form>
                          )}
                          <form action={updateUser} className="flex flex-wrap gap-2 items-center">
                            <input type="hidden" name="id" value={user.id} />
                            <input name="name" defaultValue={user.name || ''} className="border rounded px-2 py-1 w-40" placeholder="Nombre" />
                            <select name="role" defaultValue={user.role} className="border rounded px-2 py-1">
                              <option value="CLIENTE">CLIENTE</option>
                              <option value="ALIADO">ALIADO</option>
                              <option value="VENDEDOR">VENDEDOR</option>
                              <option value="DESPACHO">DESPACHO</option>
                              <option value="ARCHITECTO">ARCHITECTO</option>
                              <option value="ADMIN">ADMIN</option>
                            </select>
                            {user.role === 'VENDEDOR' && (
                              <input name="commissionPercent" type="number" step="0.01" min="0" max="100" defaultValue={(user as any).commissionPercent?.toString?.()} placeholder="% Comision" className="border rounded px-2 py-1 w-32" />
                            )}
                            <PendingButton className="px-3 py-1 bg-gray-800 text-white rounded" pendingText="Guardando...">Guardar</PendingButton>
                          </form>
                          <ResendVerificationBtn email={user.email} />
                          <form action={anonymizeUserByForm} className="flex flex-wrap gap-2 items-center">
                            <input type="hidden" name="id" value={user.id} />
                            <input name="secret" type="password" placeholder="Clave secreta" className="border rounded px-2 py-1 w-40" required />
                            <PendingButton className="px-3 py-1 bg-yellow-600 text-white rounded" pendingText="Anonimizando." title="Anononimizar usuario">Anonimizar</PendingButton>
                          </form>
                          <form action={deleteUserByForm} className="flex flex-wrap gap-2 items-center">
                            <input type="hidden" name="id" value={user.id} />
                            <input name="secret" type="password" placeholder="Clave secreta" className="border rounded px-2 py-1 w-40" required />
                            <PendingButton className="px-3 py-1 bg-red-600 text-white rounded" pendingText="Eliminando..." title="Eliminar usuario">Eliminar</PendingButton>
                          </form>
                          {isRoot && (
                            <form action={updateUserPasswordByForm} className="flex flex-wrap gap-2 items-center">
                              <input type="hidden" name="id" value={user.id} />
                              <input name="newPassword" type="password" placeholder="Nueva clave (min 8 + numero)" className="border rounded px-2 py-1 w-56" required minLength={8} pattern="(?=.*\\d).{8,}" />
                              <input name="confirm" type="password" placeholder="Confirmar clave" className="border rounded px-2 py-1 w-56" required minLength={8} />
                              <PendingButton className="px-3 py-1 bg-blue-600 text-white rounded" pendingText="Actualizando..." title="Cambiar clave">Cambiar clave</PendingButton>
                            </form>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}
