import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/server/actions/auth';

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
    const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin;
    const res = await requestPasswordReset(email, baseUrl);
    return NextResponse.json({ ok: true, message: res?.message || 'Si el correo está registrado, recibirás un enlace para recuperar tu contraseña.' });
  } catch (e: any) {
    // Do not leak detailed errors
    return NextResponse.json({ ok: true, message: 'Si el correo está registrado, recibirás un enlace para recuperar tu contraseña.' });
  }
}
