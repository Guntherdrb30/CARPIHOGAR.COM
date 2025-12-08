
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { isStrongPassword } from '@/lib/password';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const { name, email, password, isAlly, isDelivery, deliveryCedula, deliveryPhone, deliveryAddress, deliveryVehicleType, deliveryVehicleBrand, deliveryVehicleModel, deliveryMotoPlate, deliveryChassisSerial, deliveryIdImageUrl, deliverySelfieUrl, agreeDelivery } = await req.json();
    const emailLc = String(email || '').trim().toLowerCase();
    const pwd = String(password || '').trim();

    if (!name || !emailLc || !pwd) {
      return NextResponse.json({ message: 'Missing fields' }, { status: 400 });
    }

    if (!isStrongPassword(pwd)) {
      return NextResponse.json(
        { message: 'La contrasena debe tener al menos 8 caracteres y contener al menos un numero.' },
        { status: 400 }
      );
    }

    const exist = await prisma.user.findUnique({
      where: { email: emailLc },
    });

    if (exist) {
      return NextResponse.json({ message: 'Email already exists' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(pwd, 10);

    // Basic delivery validation (backend) to match UI
    if (isDelivery) {
      if (!deliveryVehicleBrand || !deliveryVehicleModel) {
        return NextResponse.json({ message: 'Faltan marca y modelo del vehiculo' }, { status: 400 });
      }
      const vtype = String(deliveryVehicleType || '').toUpperCase();
      const plate = String(deliveryMotoPlate || '').replace(/\s+/g,'').toUpperCase();
      const vin = String(deliveryChassisSerial || '').replace(/\s+/g,'').toUpperCase();
      const plateOk = /^[A-Z0-9-]{5,8}$/.test(plate);
      const vinOk = (vtype === 'MOTO') ? vin.length >= 6 : /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
      if (!plateOk) return NextResponse.json({ message: 'Placa invalida' }, { status: 400 });
      if (!vinOk) return NextResponse.json({ message: vtype === 'MOTO' ? 'Serial de chasis invalido' : 'VIN invalido (17 caracteres, sin I/O/Q)' }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        name,
        email: emailLc,
        password: hashedPassword,
        role: 'CLIENTE',
        phone: (isDelivery ? (deliveryPhone || null) : null),
        alliedStatus: isAlly ? 'PENDING' : 'NONE',
        deliveryStatus: isDelivery ? 'PENDING' as any : 'NONE' as any,
        deliveryCedula: isDelivery ? (deliveryCedula || null) : null,
        deliveryAddress: isDelivery ? (deliveryAddress || null) : null,
        deliveryVehicleType: isDelivery ? (deliveryVehicleType || null) : null,
        deliveryVehicleBrand: isDelivery ? (deliveryVehicleBrand || null) : null,
        deliveryVehicleModel: isDelivery ? (deliveryVehicleModel || null) : null,
        deliveryMotoPlate: isDelivery ? (deliveryMotoPlate || null) : null,
        deliveryChassisSerial: isDelivery ? (deliveryChassisSerial || null) : null,
        deliveryIdImageUrl: isDelivery ? (deliveryIdImageUrl || null) : null,
        deliverySelfieUrl: isDelivery ? (deliverySelfieUrl || null) : null,
        deliveryAgreementAcceptedAt: (isDelivery && agreeDelivery) ? (new Date() as any) : null,
        deliveryAgreementVersion: (isDelivery && agreeDelivery) ? 1 : null,
        deliveryAgreementIp: (isDelivery && agreeDelivery) ? (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '') : null,
      },
    });

    // Send verification email (best-effort)
    try {
      const crypto = await import('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: token,
          emailVerificationTokenExpiresAt: expires as any,
          emailVerifiedAt: null,
        },
      });
      if (process.env.EMAIL_ENABLED === 'true') {
        const { sendMail, basicTemplate } = await import('@/lib/mailer');
        const base = process.env.NEXT_PUBLIC_URL || new URL(req.url).origin;
        const verifyUrl = `${base}/api/auth/verify-email?token=${token}`;
        const contractUrl =
          isDelivery && (user as any).deliveryStatus === 'PENDING'
            ? `${base}/api/delivery/contrato/pdf`
            : '';
        const extraDeliveryHtml = contractUrl
          ? `<p>Si te registraste como Delivery, puedes descargar tu contrato en PDF desde este enlace:</p><p><a href="${contractUrl}">Contrato de Delivery</a></p>`
          : '';
        const html = basicTemplate(
          'Verifica tu correo',
          `<p>Hola ${name || ''},</p><p>Confirma tu correo para activar tu cuenta:</p><p><a href="${verifyUrl}">Verificar correo</a></p><p>O copia este enlace:<br>${verifyUrl}</p>${extraDeliveryHtml}`,
        );
        await sendMail({ to: emailLc, subject: 'Verifica tu correo', html });
      }
    } catch {}

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 });
  }
}




