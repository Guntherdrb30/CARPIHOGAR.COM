import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isEmailEnabled } from '@/lib/mailer';

export async function POST(req: Request) {
  try {
    const ct = (req.headers.get('content-type') || '').toLowerCase();
    let email = '';
    if (ct.includes('application/json')) {
      const body = await req.json().catch(() => ({} as any));
      email = String(body?.email || '').trim().toLowerCase();
    } else {
      const form = await req.formData().catch(() => null);
      email = String(form?.get('email') || '').trim().toLowerCase();
    }
    if (!email) return NextResponse.json({ ok: false, error: 'email_required' }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ ok: true }); // don't leak
    if ((user as any).emailVerifiedAt) return NextResponse.json({ ok: true, already: true });
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);
    await prisma.user.update({ where: { id: user.id }, data: { emailVerificationToken: token, emailVerificationTokenExpiresAt: expires as any } });
    let emailed = false;
    if (isEmailEnabled()) {
      try {
        const { sendMail, basicTemplate } = await import('@/lib/mailer');
        const base = process.env.NEXT_PUBLIC_URL || new URL(req.url).origin;
        const verifyUrl = `${base}/api/auth/verify-email?token=${token}`;
        const html = basicTemplate('Verifica tu correo', `<p>Confirma tu correo para activar tu cuenta:</p><p><a href="${verifyUrl}">Verificar correo</a></p>`);
        const r: any = await sendMail({ to: email, subject: 'Verifica tu correo', html });
        emailed = !!r?.ok;
      } catch {}
    }
    return NextResponse.json({ ok: true, emailed });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}





