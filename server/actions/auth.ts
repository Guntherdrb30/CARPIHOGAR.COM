"use server";

import prisma from '@/lib/prisma';
import { randomBytes, createHash } from 'crypto';
import { sendPasswordResetEmail } from './email';
import { isStrongPassword } from '@/lib/password';

export async function requestPasswordReset(email: string, baseUrl?: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const token = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(token).digest('hex');

    const passwordResetTokenExpiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hash,
        passwordResetTokenExpiresAt,
      },
    });

    await sendPasswordResetEmail(user.email, token, baseUrl);
  }

  // Always return a generic message to avoid email enumeration
  return {
    message:
      'Si el correo esta registrado, recibiras un enlace para recuperar tu contrasena.',
  };
}

export async function resetPassword(token: string, newPassword: string) {
  const hashedToken = createHash('sha256').update(token).digest('hex');

  if (!isStrongPassword(newPassword)) {
    throw new Error(
      'La contrasena debe tener al menos 8 caracteres y contener al menos un numero.',
    );
  }

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetTokenExpiresAt: { gt: new Date() },
    },
  });

  if (!user) {
    throw new Error('El token es invalido o ha expirado.');
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bcrypt = require('bcrypt');
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: passwordHash,
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
    },
  });

  return { message: 'Contrasena actualizada correctamente.' };
}
