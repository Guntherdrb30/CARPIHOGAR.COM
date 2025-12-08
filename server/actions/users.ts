'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDeleteSecret } from '@/server/actions/settings';
import { isStrongPassword } from '@/lib/password';

const prisma = new PrismaClient();

export async function requestAlly() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const emailVerified = (session?.user as any)?.emailVerified === true;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) throw new Error('Not authenticated');
  // Require verification only for CLIENTE/ALIADO/DELIVERY requesting ally status
  if (!emailVerified && (role === 'CLIENTE' || role === 'ALIADO' || role === 'DELIVERY')) throw new Error('Email not verified');
  await prisma.user.update({ where: { id: userId }, data: { alliedStatus: 'PENDING' } });
  revalidatePath('/');
}

export async function approveAlly(userId: string) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  await prisma.user.update({ where: { id: userId }, data: { role: 'ALIADO', alliedStatus: 'APPROVED' } });
  revalidatePath('/dashboard/admin/usuarios');
  try { redirect('/dashboard/admin/usuarios?message=Aliado%20aprobado'); } catch {}
}

export async function getPendingDeliveries() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const list = await prisma.user.findMany({
    where: { deliveryStatus: 'PENDING' as any },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      deliveryStatus: true,
      deliveryCedula: true,
      deliveryAddress: true,
      deliveryMotoPlate: true,
      deliveryChassisSerial: true,
      deliveryIdImageUrl: true,
      deliverySelfieUrl: true,
      deliverySignedContractUrl: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return list;
}

export async function approveDeliveryByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const id = String(formData.get('userId') || '');
  if (!id) throw new Error('Missing userId');
  await prisma.user.update({ where: { id }, data: { role: 'DELIVERY' as any, deliveryStatus: 'APPROVED' as any } });
  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'DELIVERY_APPROVED', details: id } }); } catch {}
  try { revalidatePath('/dashboard/admin/delivery/solicitudes'); } catch {}
}

export async function rejectDeliveryByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const id = String(formData.get('userId') || '');
  if (!id) throw new Error('Missing userId');
  await prisma.user.update({ where: { id }, data: { deliveryStatus: 'NONE' as any } });
  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'DELIVERY_REJECTED', details: id } }); } catch {}
  try { revalidatePath('/dashboard/admin/delivery/solicitudes'); } catch {}
}

export async function getUsers(q?: string) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const where: any = {};
  const query = String(q || '').trim();
  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } as any },
      { email: { contains: query, mode: 'insensitive' } as any },
      { phone: { contains: query, mode: 'insensitive' } as any },
      // Coincidencias por Cédula/RIF a partir de pedidos del usuario
      { orders: { some: { customerTaxId: { contains: query, mode: 'insensitive' } as any } } },
    ];
  }
  const users = await prisma.user.findMany({ where, select: { id:true, name:true, email:true, phone:true, role:true, alliedStatus:true, commissionPercent:true, createdAt:true }, orderBy: { createdAt: 'desc' } });
  return users.map((u: any) => ({ ...u, commissionPercent: u.commissionPercent == null ? null : Number(u.commissionPercent), createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null }));
}

export async function createAdminUser(name: string, email: string, password: string) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const emailLc = String(email || '').trim().toLowerCase();
  const bcrypt = (await import('bcrypt')).default; const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({ where: { email: emailLc }, update: { name, password: hashed, role: 'ADMIN', alliedStatus: 'NONE' }, create: { name, email: emailLc, password: hashed, role: 'ADMIN', alliedStatus: 'NONE' } });
  revalidatePath('/dashboard/admin/usuarios');
  try {
    if (process.env.EMAIL_ENABLED === 'true') {
      const { sendAdminUserCreatedEmail } = await import('@/server/actions/email');
      await sendAdminUserCreatedEmail(email, 'ADMIN');
    }
  } catch {}
  // Issue verification token and email
  try {
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000*60*60*24);
    await prisma.user.update({ where: { id: user.id }, data: { emailVerificationToken: token, emailVerificationTokenExpiresAt: expires as any, emailVerifiedAt: null } });
    if (process.env.EMAIL_ENABLED === 'true') {
      const { sendMail, basicTemplate } = await import('@/lib/mailer');
      const base = process.env.NEXT_PUBLIC_URL || '';
      const verifyUrl = `${base}/api/auth/verify-email?token=${token}`;
      const html = basicTemplate('Verifica tu correo', `<p>Se ha creado tu usuario ADMIN. Verifica tu correo para activarlo:</p><p>${verifyUrl}</p>`);
      await sendMail({ to: email, subject: 'Verifica tu correo', html });
    }
  } catch {}
  return user;
}

export async function createSellerUser(name: string, email: string, password: string, commissionPercent?: number) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const emailLc = String(email || '').trim().toLowerCase();
  const bcrypt = (await import('bcrypt')).default; const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({ where: { email: emailLc }, update: { name, password: hashed, role: 'VENDEDOR', alliedStatus: 'NONE', commissionPercent: (commissionPercent ?? null) as any }, create: { name, email: emailLc, password: hashed, role: 'VENDEDOR', alliedStatus: 'NONE', commissionPercent: (commissionPercent ?? null) as any } });
  revalidatePath('/dashboard/admin/usuarios');
  try {
    if (process.env.EMAIL_ENABLED === 'true') {
      const { sendAdminUserCreatedEmail } = await import('@/server/actions/email');
      await sendAdminUserCreatedEmail(email, 'VENDEDOR');
    }
  } catch {}
  try {
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000*60*60*24);
    await prisma.user.update({ where: { id: user.id }, data: { emailVerificationToken: token, emailVerificationTokenExpiresAt: expires as any, emailVerifiedAt: null } });
    if (process.env.EMAIL_ENABLED === 'true') {
      const { sendMail, basicTemplate } = await import('@/lib/mailer');
      const base = process.env.NEXT_PUBLIC_URL || '';
      const verifyUrl = `${base}/api/auth/verify-email?token=${token}`;
      const html = basicTemplate('Verifica tu correo', `<p>Se ha creado tu usuario VENDEDOR. Verifica tu correo para activarlo:</p><p>${verifyUrl}</p>`);
      await sendMail({ to: email, subject: 'Verifica tu correo', html });
    }
  } catch {}
  return user;
}

export async function createDispatcherUser(name: string, email: string, password: string) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  // Basic server-side password validation: >= 8 chars and at least 1 digit
  const hasNumber = /\d/.test(password || '');
  if (!password || password.length < 8 || !hasNumber) {
    try { redirect('/dashboard/admin/usuarios?error=Clave%20inv%C3%A1lida%20(min%208%20y%20un%20n%C3%BAmero)'); } catch {}
    return;
  }
  const emailLc = String(email || '').trim().toLowerCase();
  const bcrypt = (await import('bcrypt')).default;
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email: emailLc },
    update: { name, password: hashed, role: 'DESPACHO', alliedStatus: 'NONE' },
    create: { name, email: emailLc, password: hashed, role: 'DESPACHO', alliedStatus: 'NONE' },
  });
  revalidatePath('/dashboard/admin/usuarios');
  try {
    if (process.env.EMAIL_ENABLED === 'true') {
      const { sendAdminUserCreatedEmail } = await import('@/server/actions/email');
      await sendAdminUserCreatedEmail(email, 'DESPACHO');
      // Issue email verification token and send verify link
      const crypto = await import('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);
      await prisma.user.update({ where: { id: user.id }, data: { emailVerificationToken: token, emailVerificationTokenExpiresAt: expires as any, emailVerifiedAt: null } });
      try {
        const { sendMail, basicTemplate } = await import('@/lib/mailer');
        const base = process.env.NEXT_PUBLIC_URL || '';
        const verifyUrl = `${base}/api/auth/verify-email?token=${token}`;
        const html = basicTemplate('Verifica tu correo', `<p>Se creó tu usuario de despacho.</p><p>Confirma tu correo para activar tu cuenta:</p><p><a href=\"${verifyUrl}\">Verificar correo</a></p>`);
        await sendMail({ to: email, subject: 'Verifica tu correo', html });
      } catch {}
    }
  } catch {}
  return user;
}

export async function updateUser(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const id = String(formData.get('id'));
  const name = formData.get('name');
  const role = formData.get('role');
  const commission = formData.get('commissionPercent');
  const current = await prisma.user.findUnique({ where: { id }, select: { role:true, commissionPercent:true, name:true } });
  if (!current) { try { redirect('/dashboard/admin/usuarios?error=Usuario%20no%20encontrado'); } catch {} ; return { ok:false } as any; }
  const data: any = {};
  if (name !== null) data.name = String(name);
  if (role !== null) {
    const r = String(role);
    if (['CLIENTE','ALIADO','VENDEDOR','DESPACHO','ADMIN'].includes(r)) data.role = r as any;
  }
  let commissionLogNeeded = false; let oldCommission = current.commissionPercent as any; let newCommission: number | null | undefined = undefined; const effectiveRole = (data.role ?? current.role) as string;
  if (commission !== null && effectiveRole === 'VENDEDOR') { const num = String(commission).length ? parseFloat(String(commission)) : null; data.commissionPercent = (num === null ? null : (num as any)); newCommission = num; commissionLogNeeded = true; }
  try { await prisma.user.update({ where: { id }, data }); } catch { try { redirect('/dashboard/admin/usuarios?error=No%20se%20pudo%20actualizar'); } catch {} ; return { ok:false } as any; }
  if (commissionLogNeeded) { try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'SELLER_COMMISSION_UPDATE', details: `target:${id};from:${oldCommission ?? 'null'};to:${newCommission ?? 'null'}` } }); } catch {} }
  revalidatePath('/dashboard/admin/usuarios');
  try { redirect('/dashboard/admin/usuarios?message=Cambios%20guardados'); } catch {}
  return { ok:true } as any;
}

export async function deleteUserByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const id = String(formData.get('id') || '');
  const secret = String(formData.get('secret') || '').trim();
  const configured = await getDeleteSecret();
  if (!configured) { try { redirect('/dashboard/admin/usuarios?error=Falta%20configurar%20la%20clave'); } catch {} ; return { ok:false } as any; }
  if (secret !== configured) { try { redirect('/dashboard/admin/usuarios?error=Clave%20secreta%20inv%C3%A1lida'); } catch {} ; return { ok:false } as any; }
  const target = await prisma.user.findUnique({ where: { id }, select: { id:true, email:true } });
  if (!target) { try { redirect('/dashboard/admin/usuarios?error=Usuario%20no%20encontrado'); } catch {} ; return { ok:false } as any; }
  const email = String(target.email || '').toLowerCase(); const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
  if (email === rootEmail) { try { redirect('/dashboard/admin/usuarios?error=No%20se%20puede%20eliminar%20el%20usuario%20root'); } catch {} ; return { ok:false } as any; }
  if (String((session?.user as any)?.id || '') === id) { try { redirect('/dashboard/admin/usuarios?error=No%20puedes%20eliminar%20tu%20propio%20usuario'); } catch {} ; return { ok:false } as any; }
  try { await prisma.user.delete({ where: { id } }); try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'USER_DELETE', details: `id:${id};email:${email}` } }); } catch {} } catch { try { redirect('/dashboard/admin/usuarios?error=No%20se%20puede%20eliminar%3A%20tiene%20registros%20relacionados'); } catch {} ; return { ok:false } as any; }
  revalidatePath('/dashboard/admin/usuarios');
  try { redirect('/dashboard/admin/usuarios?message=Usuario%20eliminado'); } catch {}
  return { ok:true } as any;
}

export async function anonymizeUserByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  const email = String((session?.user as any)?.email || '').toLowerCase();
  const role = String((session?.user as any)?.role || '');
  const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
  if (!(role === 'ADMIN' && email === rootEmail)) throw new Error('Not authorized');
  const id = String(formData.get('id') || '');
  const secret = String(formData.get('secret') || '').trim();
  const configured = await getDeleteSecret();
  if (!configured) { try { redirect('/dashboard/admin/usuarios?error=Falta%20configurar%20la%20clave'); } catch {} ; return { ok:false } as any; }
  if (secret !== configured) { try { redirect('/dashboard/admin/usuarios?error=Clave%20secreta%20inv%C3%A1lida'); } catch {} ; return { ok:false } as any; }
  const target = await prisma.user.findUnique({ where: { id }, select: { id:true, email:true } });
  if (!target) { try { redirect('/dashboard/admin/usuarios?error=Usuario%20no%20encontrado'); } catch {} ; return { ok:false } as any; }
  const lower = (s: string) => String(s || '').trim().toLowerCase();
  const emailLc = lower(target.email || '');
  if (emailLc === rootEmail) { try { redirect('/dashboard/admin/usuarios?error=No%20se%20puede%20anonimizar%20el%20usuario%20root'); } catch {} ; return { ok:false } as any; }
  try {
    const crypto = await import('crypto');
    const newEmail = `deleted+${target.id}@carpihogar.ai`;
    const randomPass = crypto.randomBytes(16).toString('hex');
    const bcrypt = (await import('bcrypt')).default; const hashed = await bcrypt.hash(randomPass, 10);
    await prisma.user.update({ where: { id }, data: {
      email: newEmail,
      name: 'Eliminado',
      phone: null,
      password: hashed,
      alliedStatus: 'NONE' as any,
      role: 'CLIENTE' as any,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
      emailVerifiedAt: null,
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
    }});
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'USER_ANONYMIZED', details: `id:${id};from:${target.email}` } }); } catch {}
  } catch {
    try { redirect('/dashboard/admin/usuarios?error=No%20se%20pudo%20anonimizar'); } catch {} ; return { ok:false } as any;
  }
  revalidatePath('/dashboard/admin/usuarios');
  try { redirect('/dashboard/admin/usuarios?message=Usuario%20anonimizado'); } catch {}
  return { ok:true } as any;
}

export async function updateUserPasswordByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  const email = String((session?.user as any)?.email || '').toLowerCase();
  const role = String((session?.user as any)?.role || '');
  const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
  if (!(role === 'ADMIN' && email === rootEmail)) { redirect('/dashboard/admin/usuarios?pw=err'); }
  const id = String(formData.get('id') || '');
  const newPassword = String(formData.get('newPassword') || '').trim();
  const confirm = String(formData.get('confirm') || '').trim();
  if (!id) redirect('/dashboard/admin/usuarios?pw=err');
  if (!isStrongPassword(newPassword)) redirect('/dashboard/admin/usuarios?pw=err');
  if (newPassword !== confirm) redirect('/dashboard/admin/usuarios?pw=err');
  const target = await prisma.user.findUnique({ where: { id }, select: { id:true, email:true } }); if (!target) redirect('/dashboard/admin/usuarios?pw=err');
  try { const bcrypt = (await import('bcrypt')).default; const hashed = await bcrypt.hash(newPassword, 10); await prisma.user.update({ where: { id }, data: { password: hashed } }); try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'USER_PASSWORD_RESET', details: `target:${id};by:${email}` } }); } catch {}; revalidatePath('/dashboard/admin/usuarios'); redirect('/dashboard/admin/usuarios?pw=ok'); } catch { redirect('/dashboard/admin/usuarios?pw=err'); }
}
