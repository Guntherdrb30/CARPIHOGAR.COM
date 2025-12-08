"use server";

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function getBranches() {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const dec = (v: any) => {
      if (v == null) return null;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return Number(v);
      if (typeof v?.toNumber === 'function') return v.toNumber();
      const num = Number(v);
      return Number.isFinite(num) ? num : null;
    };
    return branches.map((b) => ({
      ...b,
      lat: dec(b.lat),
      lng: dec(b.lng),
      motoRatePerKmUSD: dec(b.motoRatePerKmUSD),
      carRatePerKmUSD: dec(b.carRatePerKmUSD),
      vanRatePerKmUSD: dec(b.vanRatePerKmUSD),
      motoMinFeeUSD: dec(b.motoMinFeeUSD),
      vanMinFeeUSD: dec(b.vanMinFeeUSD),
    }));
  } catch {
    return [];
  }
}

export async function createBranchAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    throw new Error('Not authorized');
  }
  const required = (value: FormDataEntryValue | null) => String(value || '').trim();
  const name = required(formData.get('name'));
  const code = required(formData.get('code')).toUpperCase();
  const state = required(formData.get('state'));
  const city = required(formData.get('city'));
  const address = required(formData.get('address'));
  if (!name || !code || !state || !city || !address) {
    redirect('/dashboard/admin/sucursales?error=Completa%20los%20campos%20requeridos');
  }

  const parseDecimal = (value: FormDataEntryValue | null) => {
    if (value == null) return null;
    const str = String(value).trim();
    if (!str) return null;
    const num = Number(str.replace(',', '.'));
    return Number.isFinite(num) ? num : null;
  };

  const lat = parseDecimal(formData.get('lat'));
  const lng = parseDecimal(formData.get('lng'));
  const motoRate = parseDecimal(formData.get('motoRatePerKmUSD'));
  const carRate = parseDecimal(formData.get('carRatePerKmUSD'));
  const vanRate = parseDecimal(formData.get('vanRatePerKmUSD'));
  const motoMin = parseDecimal(formData.get('motoMinFeeUSD'));
  const vanMin = parseDecimal(formData.get('vanMinFeeUSD'));
  const isActive = String(formData.get('isActive') || 'on') === 'on';

  try {
    await prisma.branch.create({
      data: {
        name,
        code,
        state,
        city,
        address,
        lat: lat as any,
        lng: lng as any,
        motoRatePerKmUSD: motoRate as any,
        carRatePerKmUSD: carRate as any,
        vanRatePerKmUSD: vanRate as any,
        motoMinFeeUSD: motoMin as any,
        vanMinFeeUSD: vanMin as any,
        isActive,
      },
    });
    revalidatePath('/dashboard/admin/sucursales');
    redirect('/dashboard/admin/sucursales?message=Sucursal%20creada');
  } catch (err: any) {
    const msg =
      err?.code === 'P2002'
        ? 'Ya existe una sucursal con ese código.'
        : 'No se pudo crear la sucursal.';
    redirect(`/dashboard/admin/sucursales?error=${encodeURIComponent(msg)}`);
  }
}
