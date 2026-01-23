import prisma from '@/lib/prisma';
import { sendMail, basicTemplate } from '@/lib/mailer';

export async function sendPasswordResetEmail(to: string, token: string, baseUrl?: string) {
  if (!to || !token) return;
  const base = baseUrl || process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || '';
  const url = `${String(base).replace(/\/$/, '')}/auth/reset-password?token=${encodeURIComponent(token)}`;
  const html = basicTemplate(
    'Restablecer contrasena',
    `<p>Solicitaste restablecer tu contrasena.</p>
     <p>Puedes crear una nueva contrasena usando este enlace:</p>
     <p><a href="${url}">Restablecer contrasena</a></p>
     <p>Si no funciona, copia y pega esta URL en tu navegador:<br>${url}</p>
     <p>El enlace expira en 1 hora.</p>`
  );
  await sendMail({ to, subject: 'Recupera tu contrasena', html });
}

export async function sendWelcomeEmail(to: string, name?: string | null) {
  if (!to) return;
  const body = basicTemplate('Bienvenido', `<p>Hola ${name || ''},</p><p>Gracias por registrarte en Carpihogar.ai!</p><p>Ya puedes iniciar sesion y completar tu perfil.</p>`);
  await sendMail({ to, subject: 'Bienvenido a Carpihogar!', html: body });
}

export async function sendAdminUserCreatedEmail(to: string, role: string) {
  if (!to) return;
  const body = basicTemplate('Cuenta creada', `<p>Se ha creado tu cuenta con rol <strong>${role}</strong>.</p><p>Puedes iniciar sesion en el panel.</p>`);
  await sendMail({ to, subject: `Tu usuario (${role}) ha sido creado`, html: body });
}

export async function sendQuoteCreatedEmail(quoteId: string) {
  const q = await prisma.quote.findUnique({ where: { id: quoteId }, include: { user: true, items: true } });
  if (!q?.user?.email) return;
  const items = (q.items || []).map((it) => `<li>${it.name} x ${it.quantity} — $ ${Number(it.priceUSD as any).toFixed(2)}</li>`).join('');
  const total = Number(q.totalUSD as any).toFixed(2);
  const body = basicTemplate('Presupuesto creado', `<p>Hola ${q.user?.name || ''},</p><p>Hemos generado tu presupuesto ${q.id.slice(0,8)}.</p><ul>${items}</ul><p><strong>Total USD:</strong> $ ${total}</p>`);
  await sendMail({ to: q.user.email, subject: `Tu presupuesto ${q.id.slice(0,8)}`, html: body });
}

export async function sendReceiptEmail(orderId: string, to: string, tipo: 'recibo'|'nota'|'factura' = 'recibo', moneda: 'USD'|'VES' = 'USD') {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, user: true, payment: true } });
    if (!order) return;
    const currency = moneda === 'VES' ? 'VES' : 'USD';
    const rate = Number(order.tasaVES || 0) || 1;
    const toMoney = (value: number) => (currency === 'VES' ? `Bs ${value.toFixed(2)}` : `$ ${value.toFixed(2)}`);
    const linePrice = (p: number) => (currency === 'VES' ? p * rate : p);
    const itemsHtml = (order.items || [])
      .map((it) => {
        const unit = linePrice(Number(it.priceUSD || 0));
        const qty = Number(it.quantity || 0);
        const lineTotal = unit * qty;
        return `<tr><td style="padding:6px 0">${it.name}</td><td style="padding:6px 0;text-align:center">${qty}</td><td style="padding:6px 0;text-align:right">${toMoney(unit)}</td><td style="padding:6px 0;text-align:right">${toMoney(lineTotal)}</td></tr>`;
      })
      .join('');
    const subtotalBase = Number(order.subtotalUSD || 0);
    const subtotal = currency === 'VES' ? subtotalBase * rate : subtotalBase;
    const ivaPct = Number(order.ivaPercent || 0);
    const iva = subtotal * (ivaPct / 100);
    const total = currency === 'VES' ? Number(order.totalVES || 0) : Number(order.totalUSD || 0);
    const titulo = tipo === 'factura' ? 'Factura' : (tipo === 'nota' ? 'Nota de Entrega' : 'Recibo');
    const base = (process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
    const pdfUrl = base ? `${base}/api/orders/${order.id}/pdf?tipo=${encodeURIComponent(tipo)}&moneda=${encodeURIComponent(moneda)}` : '';
    const payMethod = order.payment?.method ? String(order.payment.method).toUpperCase() : '';
    const payRef = order.payment?.reference ? String(order.payment.reference) : '';

    const body = basicTemplate(
      `${titulo} de compra`,
      `
      <p>Gracias por tu compra ${order.user?.name || ''}.</p>
      <p>Detalle de la orden <strong>${order.id.slice(0,8)}</strong>:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #fed7aa">
        <tr style="color:#6b7280;font-size:12px"><th align="left">Producto</th><th align="center">Cant.</th><th align="right">Precio</th><th align="right">Subtotal</th></tr>
        ${itemsHtml}
      </table>
      <p style="margin:12px 0 4px"><strong>Subtotal:</strong> ${toMoney(subtotal)}</p>
      <p style="margin:0 0 4px"><strong>IVA (${ivaPct.toFixed(2)}%):</strong> ${toMoney(iva)}</p>
      <p style="margin:0 0 12px"><strong>Total:</strong> ${toMoney(total)}</p>
      ${payMethod ? `<p><strong>Metodo de pago:</strong> ${payMethod}${payRef ? ` (Ref: ${payRef})` : ''}</p>` : ''}
      ${pdfUrl ? `<p><a href="${pdfUrl}">Descargar ${titulo} en PDF</a></p>` : ''}
      <p>Gracias por confiar en Carpihogar.</p>
      `
    );
    await sendMail({ to, subject: `${titulo} de tu compra ${order.id.slice(0,8)}`, html: body });
  } catch {}
}

