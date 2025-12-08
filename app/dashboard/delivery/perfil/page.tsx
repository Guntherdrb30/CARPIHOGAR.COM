import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { redirect } from 'next/navigation';

async function updateDeliveryPayoutProfile(formData: FormData) {
  'use server';
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'DELIVERY') {
    throw new Error('Not authorized');
  }
  const userId = (session.user as any).id as string;

  const payoutBankName = String(formData.get('payoutBankName') || '').trim() || null;
  const payoutBankAccount = String(formData.get('payoutBankAccount') || '').trim() || null;
  const payoutBankIdNumber = String(formData.get('payoutBankIdNumber') || '').trim() || null;
  const payoutPmBank = String(formData.get('payoutPmBank') || '').trim() || null;
  const payoutPmPhone = String(formData.get('payoutPmPhone') || '').trim() || null;
  const payoutPmIdNumber = String(formData.get('payoutPmIdNumber') || '').trim() || null;

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  });

  // Validación básica: si se llena pago móvil, el teléfono debe coincidir con el del perfil
  if (payoutPmPhone && current?.phone) {
    const normalize = (v: string) => v.replace(/\D+/g, '');
    if (normalize(payoutPmPhone) !== normalize(current.phone)) {
      throw new Error('El teléfono de Pago Móvil debe ser el mismo que tu teléfono de perfil.');
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      payoutBankName,
      payoutBankAccount,
      payoutBankIdNumber,
      payoutPmBank,
      payoutPmPhone,
      payoutPmIdNumber,
    },
  });

  redirect('/dashboard/delivery/perfil?message=Perfil%20de%20pago%20actualizado');
}

export default async function DeliveryPayoutProfilePage({
  searchParams,
}: {
  searchParams?: { message?: string; error?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any)?.role !== 'DELIVERY') {
    redirect('/auth/login?callbackUrl=/dashboard/delivery/perfil');
  }
  const userId = (session.user as any).id as string;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      phone: true,
      payoutBankName: true,
      payoutBankAccount: true,
      payoutBankIdNumber: true,
      payoutPmBank: true,
      payoutPmPhone: true,
      payoutPmIdNumber: true,
    },
  });

  if (!me) {
    redirect('/auth/login');
  }

  const msg = searchParams?.message || '';
  const err = searchParams?.error || '';

  return (
    <div className="container mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Perfil de pagos</h1>
      <p className="text-sm text-gray-600">
        Completa tus datos bancarios y de Pago Móvil. Se usarán para tus liquidaciones como delivery.
      </p>

      {msg && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="space-y-2 rounded bg-white p-4 shadow">
        <div className="text-sm text-gray-700">
          <div>
            <span className="font-semibold">Nombre:</span> {me.name || '-'}
          </div>
          <div>
            <span className="font-semibold">Email:</span> {me.email}
          </div>
          <div>
            <span className="font-semibold">Teléfono de perfil:</span> {me.phone || '—'}
          </div>
        </div>
      </div>

      <form action={updateDeliveryPayoutProfile} className="space-y-4 rounded bg-white p-4 shadow">
        <h2 className="text-lg font-semibold">Datos para transferencias</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Banco
            </label>
            <input
              name="payoutBankName"
              defaultValue={me.payoutBankName || ''}
              placeholder="Ej: Banesco, Mercantil"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Número de cuenta
            </label>
            <input
              name="payoutBankAccount"
              defaultValue={me.payoutBankAccount || ''}
              placeholder="Cuenta corriente o ahorro"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Cédula / RIF del titular
            </label>
            <input
              name="payoutBankIdNumber"
              defaultValue={me.payoutBankIdNumber || ''}
              placeholder="V-12345678"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
        </div>

        <h2 className="mt-4 text-lg font-semibold">Datos de Pago Móvil</h2>
        <p className="text-xs text-gray-500 mb-2">
          El teléfono de Pago Móvil debe ser el mismo que usas en tu perfil de delivery.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Banco (Pago Móvil)
            </label>
            <input
              name="payoutPmBank"
              defaultValue={me.payoutPmBank || ''}
              placeholder="Ej: Banesco, Mercantil"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Teléfono (Pago Móvil)
            </label>
            <input
              name="payoutPmPhone"
              defaultValue={me.payoutPmPhone || me.phone || ''}
              placeholder="Ej: 0412-1234567"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Cédula (Pago Móvil)
            </label>
            <input
              name="payoutPmIdNumber"
              defaultValue={me.payoutPmIdNumber || ''}
              placeholder="V-12345678"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="inline-flex items-center rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Guardar perfil de pagos
          </button>
        </div>
      </form>
    </div>
  );
}

