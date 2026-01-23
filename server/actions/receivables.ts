"use server";

import prisma from "@/lib/prisma";
import { isEmailEnabled, sendMail } from "@/lib/mailer";
import { getDeleteSecret } from "@/server/actions/settings";
import { revalidatePath } from "next/cache";

async function recalcReceivable(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { receivable: { include: { entries: true, noteItems: true } } },
  });
  if (!order || !order.receivable) return;

  const entries = order.receivable.entries || [];
  const notes = (order.receivable as any).noteItems || [];

  const abonadoUSD = entries.reduce(
    (acc: number, e: any) => acc + Number(e.amountUSD || 0),
    0,
  );
  const totalUSD = Number(order.totalUSD || 0);

  const creditsUSD = notes
    .filter((n: any) => String(n.type) === "CREDITO")
    .reduce((acc: number, n: any) => acc + Number(n.amountUSD || 0), 0);
  const debitsUSD = notes
    .filter((n: any) => String(n.type) === "DEBITO")
    .reduce((acc: number, n: any) => acc + Number(n.amountUSD || 0), 0);

  const adjustedTotalUSD = totalUSD + debitsUSD - creditsUSD;

  let status: any = "PENDIENTE";
  if (adjustedTotalUSD <= 0.01) {
    status = abonadoUSD > 0.01 ? "PAGADO" : "CANCELADO";
  } else if (abonadoUSD >= adjustedTotalUSD - 0.01) {
    status = "PAGADO";
  } else if (abonadoUSD > 0) {
    status = "PARCIAL";
  }

  await prisma.receivable.update({
    where: { id: order.receivable.id },
    data: { status },
  });

  // Solo disparamos el flujo de "orden pagada" si hubo pagos reales
  if (status === "PAGADO" && abonadoUSD > 0.01) {
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "PAGADO" as any },
      });
    } catch {}
    try {
      const { emit } = await import("@/server/events/bus");
      await emit("order.paid" as any, { orderId });
    } catch {}
  }
}

async function generateReceivablePdf(order: any): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit/js/pdfkit.standalone.js')).default as any;
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const chunks: Buffer[] = [];
  const stream = doc as any;
  stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) => stream.on('end', () => resolve(Buffer.concat(chunks))));

  // Try to include logo from settings
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    const logoUrl = (settings as any)?.logoUrl as string | undefined;
    if (logoUrl) {
      if (logoUrl.startsWith('http')) {
        try {
          const res = await fetch(logoUrl);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            (doc as any).image(buf, 36, 24, { fit: [160, 60] });
          }
        } catch {}
      } else {
        const { promises: fs } = await import('fs');
        const path = (await import('path')).default;
        const trimmed = logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl;
        const filePath = path.join(process.cwd(), 'public', trimmed);
        try {
          const buf = await fs.readFile(filePath);
          (doc as any).image(buf, 36, 24, { fit: [160, 60] });
        } catch {}
      }
    }
  } catch {}

  const totalUSD = Number(order.totalUSD || 0);
  const entries = order.receivable?.entries || [];
  const notes = (order.receivable as any)?.noteItems || [];
  const abonadoUSD = entries.reduce(
    (a: number, e: any) => a + Number(e.amountUSD || 0),
    0,
  );
  const creditsUSD = notes
    .filter((n: any) => String(n.type) === "CREDITO")
    .reduce((acc: number, n: any) => acc + Number(n.amountUSD || 0), 0);
  const debitsUSD = notes
    .filter((n: any) => String(n.type) === "DEBITO")
    .reduce((acc: number, n: any) => acc + Number(n.amountUSD || 0), 0);
  const adjustedTotalUSD = totalUSD + debitsUSD - creditsUSD;
  const saldoUSD = Math.max(0, adjustedTotalUSD - abonadoUSD);
  const vence = (order.receivable?.dueDate || (order as any).creditDueDate || null) as Date | null;

  doc.moveDown(0.5);
  doc.fontSize(16).text(`Estado de Cuenta - Orden ${order.id}`);
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Fecha: ${new Date(order.createdAt as any).toLocaleString()}`);
  doc.text(`Cliente: ${order.user?.name || order.user?.email || ''}`);
  doc.text(`Email: ${order.user?.email || ''}`);
  doc.text(`TelÃ©fono: ${String((order.user as any)?.phone || '')}`);
  doc.text(`Vendedor: ${order.seller?.name || order.seller?.email || ''}`);
  if (vence) doc.text(`Vence: ${new Date(vence as any).toLocaleDateString()}`);
  doc.moveDown(0.5);
  doc.text(`Total original USD: $${totalUSD.toFixed(2)}`);
  if (creditsUSD > 0) {
    doc.text(`Notas de crédito: -$${creditsUSD.toFixed(2)}`);
  }
  if (debitsUSD > 0) {
    doc.text(`Notas de débito: +$${debitsUSD.toFixed(2)}`);
  }
  if (creditsUSD !== 0 || debitsUSD !== 0) {
    doc.text(`Total ajustado USD: $${adjustedTotalUSD.toFixed(2)}`);
  } else {
    // Para compatibilidad cuando no hay notas
    doc.text(`Total ajustado USD: $${adjustedTotalUSD.toFixed(2)}`);
  }
  doc.text(`Abonado USD: $${abonadoUSD.toFixed(2)}`);
  doc.text(`Saldo USD: $${saldoUSD.toFixed(2)}`);
  if (order.receivable?.notes) { doc.moveDown(0.5).text(`Observaciones: ${order.receivable?.notes}`); }

  doc.moveDown(1);
  doc.fontSize(13).text('Detalle de abonos');
  doc.moveDown(0.5);
  doc.fontSize(11);
  if (!entries.length) {
    doc.text('Sin abonos registrados');
  } else {
    for (const e of entries) {
      const d = new Date((e as any).createdAt as any).toLocaleDateString();
      const line = `${d}  $${Number((e as any).amountUSD).toFixed(2)}  ${(e as any).currency || ''}  ${(e as any).method || ''}  Ref: ${(e as any).reference || ''}`;
      doc.text(line);
      if ((e as any).notes) doc.text(`Notas: ${(e as any).notes}`);
    }
  }

  doc.end();
  return done;
}

export async function addReceivablePayment(formData: FormData) {
  const orderId = String(formData.get('orderId') || '');
  const currency = String(formData.get('currency') || 'USD').toUpperCase() as 'USD'|'VES';
  const method = String(formData.get('method') || '') as any;
  const reference = String(formData.get('reference') || '') || null;
  const notes = String(formData.get('notes') || '') || null;
  const amountStr = String(formData.get('amount') || '0');
  const amount = Number(amountStr);
  const paidAtStr = String(formData.get('paidAt') || '').trim();
  const createdAt = paidAtStr ? new Date(paidAtStr) : undefined;
  if (!orderId || !amount || amount <= 0) {
    return { ok: false, error: 'Datos invÃ¡lidos' };
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { receivable: { include: { entries: true } } } });
  if (!order) return { ok: false, error: 'Orden no encontrada' };

  // Ensure receivable exists
  let receivable = order.receivable;
  if (!receivable) {
    receivable = await prisma.receivable.create({ data: { orderId, status: 'PENDIENTE' as any, dueDate: (order as any).creditDueDate || null } });
  }

  const tasaVES = Number(order.tasaVES || 40);
  const amountUSD = currency === 'USD' ? amount : (amount / (tasaVES || 1));

  await prisma.receivableEntry.create({ data: { receivableId: receivable.id, amountUSD: amountUSD as any, currency: currency as any, method: method || null, reference, notes, ...(createdAt ? { createdAt: createdAt as any } : {}) } });

  // Recalcular estado teniendo en cuenta notas de crédito/débito
  await recalcReceivable(orderId);

  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  try { revalidatePath('/dashboard/admin/ventas'); } catch {}
  return { ok: true };
}

export async function addReceivableNote(formData: FormData) {
  const orderId = String(formData.get('orderId') || '');
  const typeRaw = String(formData.get('type') || '').toUpperCase();
  const amount = Number(String(formData.get('amount') || '0'));
  const reason = String(formData.get('reason') || '') || null;

  if (!orderId || !amount || amount <= 0) {
    return { ok: false, error: 'Datos inválidos' } as any;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { receivable: true },
  });
  if (!order) return { ok: false, error: 'Orden no encontrada' } as any;

  // Asegura que exista la cuenta por cobrar
  let receivable = order.receivable;
  if (!receivable) {
    receivable = await prisma.receivable.create({
      data: {
        orderId,
        status: 'PENDIENTE' as any,
        dueDate: (order as any).creditDueDate || null,
      },
    });
  }

  const type: any = typeRaw === 'DEBITO' ? 'DEBITO' : 'CREDITO';

  await prisma.receivableNote.create({
    data: {
      receivableId: receivable.id,
      type,
      amountUSD: amount as any,
      reason,
    },
  });

  await recalcReceivable(orderId);
  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  revalidatePath(`/dashboard/admin/cuentas-por-cobrar/${orderId}`);
  return { ok: true } as any;
}

export async function updateReceivableNote(formData: FormData) {
  const noteId = String(formData.get('noteId') || '');
  const orderIdRaw = String(formData.get('orderId') || '');
  const typeRaw = String(formData.get('type') || '').toUpperCase();
  const amount = Number(String(formData.get('amount') || '0'));
  const reason = String(formData.get('reason') || '') || null;

  if (!noteId) return { ok: false, error: 'Nota inválida' } as any;
  if (!amount || amount <= 0) return { ok: false, error: 'Monto inválido' } as any;

  const note = await prisma.receivableNote.findUnique({
    where: { id: noteId },
    include: { receivable: { include: { order: true } } },
  });
  if (!note) return { ok: false, error: 'Nota no encontrada' } as any;

  const orderId = note.receivable?.order?.id || orderIdRaw;
  if (!orderId) return { ok: false, error: 'Orden inválida' } as any;

  const type: any = typeRaw === 'DEBITO' ? 'DEBITO' : 'CREDITO';

  await prisma.receivableNote.update({
    where: { id: noteId },
    data: {
      type,
      amountUSD: amount as any,
      reason,
    },
  });

  await recalcReceivable(orderId);
  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  revalidatePath(`/dashboard/admin/cuentas-por-cobrar/${orderId}`);
  return { ok: true } as any;
}

export async function deleteReceivableNote(formData: FormData) {
  const noteId = String(formData.get('noteId') || '');
  let orderId = String(formData.get('orderId') || '');
  const secret = String(formData.get('secret') || '');

  const configured = await getDeleteSecret();
  if (!configured) {
    return {
      ok: false,
      error:
        'Falta configurar la clave de eliminación (RECEIVABLE_DELETE_SECRET o ADMIN_DELETE_SECRET)',
    } as any;
  }
  if (secret !== configured) {
    return { ok: false, error: 'Clave secreta inválida' } as any;
  }
  if (!noteId) return { ok: false, error: 'Nota inválida' } as any;

  const note = await prisma.receivableNote.findUnique({
    where: { id: noteId },
    include: { receivable: { include: { order: true } } },
  });
  if (note?.receivable?.order?.id) {
    orderId = note.receivable.order.id;
  }

  await prisma.receivableNote.delete({ where: { id: noteId } });
  if (orderId) await recalcReceivable(orderId);
  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  if (orderId)
    revalidatePath(`/dashboard/admin/cuentas-por-cobrar/${orderId}`);
  return { ok: true } as any;
}

export async function markReceivablePaid(formData: FormData) {
  const orderId = String(formData.get('orderId') || '');
  if (!orderId) return { ok: false, error: 'Orden invÃ¡lida' };
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { receivable: { include: { entries: true } } } });
  if (!order) return { ok: false, error: 'Orden no encontrada' };
  if (!order.receivable) {
    await prisma.receivable.create({ data: { orderId, status: 'PAGADO' as any, dueDate: (order as any).creditDueDate || null } });
  } else {
    await prisma.receivable.update({ where: { id: order.receivable.id }, data: { status: 'PAGADO' as any } });
  }
  await prisma.order.update({ where: { id: orderId }, data: { status: 'PAGADO' as any } });
  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  try { revalidatePath('/dashboard/admin/ventas'); } catch {}
  return { ok: true };
}

export async function updateReceivableDueDate(formData: FormData) {
  const orderId = String(formData.get('orderId') || '');
  const dueDateStr = String(formData.get('dueDate') || '');
  const dueDate = dueDateStr ? new Date(dueDateStr) : null;
  if (!orderId) return { ok: false, error: 'Orden invÃ¡lida' };
  let receivable = await prisma.receivable.findUnique({ where: { orderId } });
  if (!receivable) {
    receivable = await prisma.receivable.create({ data: { orderId, status: 'PENDIENTE' as any, dueDate } });
  } else {
    await prisma.receivable.update({ where: { id: receivable.id }, data: { dueDate } });
  }
  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  return { ok: true };
}

export async function updateReceivableEntry(formData: FormData) {
  const entryId = String(formData.get('entryId') || '');
  const orderId = String(formData.get('orderId') || '');
  const amount = Number(String(formData.get('amount') || '0'));
  const currency = String(formData.get('currency') || 'USD').toUpperCase() as 'USD'|'VES';
  const method = String(formData.get('method') || '') || null;
  const reference = String(formData.get('reference') || '') || null;
  const notes = String(formData.get('notes') || '') || null;
  const paidAtStr = String(formData.get('paidAt') || '').trim();
  const createdAt = paidAtStr ? new Date(paidAtStr) : undefined;
  if (!entryId) return { ok: false, error: 'Entrada invÃ¡lida' } as any;
  const entry = await prisma.receivableEntry.findUnique({ where: { id: entryId }, include: { receivable: { include: { order: true } } } });
  if (!entry) return { ok: false, error: 'Entrada no encontrada' } as any;
  const order = entry.receivable?.order;
  const tasaVES = Number(order?.tasaVES || 40);
  const amountUSD = currency === 'USD' ? amount : (amount / (tasaVES || 1));
  await prisma.receivableEntry.update({ where: { id: entryId }, data: { amountUSD: amountUSD as any, currency: currency as any, method: method as any, reference, notes, ...(createdAt ? { createdAt: createdAt as any } : {}) } });
  await recalcReceivable(order?.id || orderId);
  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  revalidatePath(`/dashboard/admin/cuentas-por-cobrar/${order?.id || orderId}`);
  return { ok: true } as any;
}

export async function deleteReceivableEntry(formData: FormData) {
  const entryId = String(formData.get('entryId') || '');
  let orderId = String(formData.get('orderId') || '');
  const secret = String(formData.get('secret') || '');
  const configured = await getDeleteSecret();
  if (!configured) {
    return { ok: false, error: 'Falta configurar la clave de eliminaciÃ³n (RECEIVABLE_DELETE_SECRET o ADMIN_DELETE_SECRET)'} as any;
  }
  if (secret !== configured) {
    return { ok: false, error: 'Clave secreta invÃ¡lida' } as any;
  }
  if (!entryId) return { ok: false, error: 'Entrada invÃ¡lida' } as any;
  const entry = await prisma.receivableEntry.findUnique({ where: { id: entryId }, include: { receivable: true } });
  if (entry?.receivable?.id) {
    const rec = await prisma.receivable.findUnique({ where: { id: entry.receivable.id }, include: { order: true } });
    orderId = rec?.order?.id || orderId;
  }
  await prisma.receivableEntry.delete({ where: { id: entryId } });
  if (orderId) await recalcReceivable(orderId);
  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  if (orderId) revalidatePath(`/dashboard/admin/cuentas-por-cobrar/${orderId}`);
  return { ok: true } as any;
}

export async function sendReceivableReminder(formData: FormData) {
  const orderId = String(formData.get('orderId') || '');
  if (!orderId) return { ok: false, error: 'Orden invÃ¡lida' };
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { receivable: { include: { entries: true, noteItems: true } }, user: true },
  });
  if (!order) return { ok: false, error: 'Orden no encontrada' };
  const to = (order.user as any)?.email as string | undefined;
  if (!to) return { ok: false, error: 'Cliente sin email' };

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const brand = (settings as any)?.brandName || 'Carpihogar.ai';
  const tasaVES = Number(order.tasaVES || (settings as any)?.tasaVES || 40);
  const totalUSD = Number(order.totalUSD || 0);
  const entries = order.receivable?.entries || [];
  const notes = (order.receivable as any)?.noteItems || [];
  const abonadoUSD = entries.reduce((acc, e: any) => acc + Number(e.amountUSD), 0);
  const creditsUSD = notes
    .filter((n: any) => String(n.type) === "CREDITO")
    .reduce((acc: number, n: any) => acc + Number(n.amountUSD || 0), 0);
  const debitsUSD = notes
    .filter((n: any) => String(n.type) === "DEBITO")
    .reduce((acc: number, n: any) => acc + Number(n.amountUSD || 0), 0);
  const adjustedTotalUSD = totalUSD + debitsUSD - creditsUSD;
  const saldoUSD = Math.max(0, adjustedTotalUSD - abonadoUSD);
  const due = order.receivable?.dueDate || (order as any).creditDueDate || null;

  const subject = `${brand} - Recordatorio de pago Orden ${order.id.slice(-6)}`;
  const lines: string[] = [];
  lines.push(`Estimado cliente,`);
  lines.push(`\nLe recordamos que posee un saldo pendiente asociado a su orden ${order.id}.`);
  const parts: string[] = [];
  parts.push(`Total original: $${totalUSD.toFixed(2)}`);
  if (creditsUSD > 0) parts.push(`Notas de crédito: -$${creditsUSD.toFixed(2)}`);
  if (debitsUSD > 0) parts.push(`Notas de débito: +$${debitsUSD.toFixed(2)}`);
  parts.push(`Total ajustado: $${adjustedTotalUSD.toFixed(2)}`);
  parts.push(`Abonado: $${abonadoUSD.toFixed(2)}`);
  parts.push(`Saldo: $${saldoUSD.toFixed(2)}`);
  lines.push(parts.join(" | "));
  if (due) lines.push(`Vencimiento: ${new Date(due as any).toLocaleDateString()}`);
  // Detalle de abonos
  if (entries.length) {
    lines.push(`\nDetalle de abonos:`);
    for (const e of entries) {
      const d = new Date((e as any).createdAt as any);
      lines.push(`- ${d.toLocaleDateString()} $${Number((e as any).amountUSD).toFixed(2)} ${String((e as any).currency)} ${String((e as any).method || '')} ${String((e as any).reference || '')}`.trim());
    }
  }
  lines.push(`\nPuede realizar su abono vÃ­a Zelle, Transferencia o Pago MÃ³vil y responder a este correo con el comprobante o referencia.`);
  lines.push(`Gracias por su preferencia.`);
  const text = lines.join('\n');
  const html = text.replace(/\n/g, '<br/>');

  if (!isEmailEnabled()) {
    console.warn('[sendReceivableReminder] EMAIL_ENABLED is off, skipping send.');
    return { ok: false, skipped: true };
  }

  try {
    let attachments: any[] = [];
    try {
      const orderFull = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: true,
          seller: true,
          receivable: { include: { entries: true, noteItems: true } },
        },
      });
      if (orderFull) {
        const pdf = await generateReceivablePdf(orderFull);
        attachments.push({ filename: `cxc_${order.id}.pdf`, content: pdf });
      }
    } catch {}
    const res: any = await sendMail({ to, subject, text, html, attachments });
    if (!res?.ok) {
      return { ok: false, error: res?.skipped || 'send_failed' };
    }
    const stamp = new Date().toISOString().slice(0,10);
    try { await prisma.auditLog.create({ data: { userId: undefined, action: 'RECEIVABLE_REMINDER_SENT', details: `order:${orderId} via:EMAIL date:${stamp}` } }); } catch {}
    try {
      const r = await prisma.receivable.findUnique({ where: { orderId } });
      if (r) {
        const newNotes = (((r.notes || '').trim() ? (r.notes + ' | ') : '') + `SHARED:EMAIL:${stamp}`).slice(0, 2000);
        await prisma.receivable.update({ where: { id: r.id }, data: { notes: newNotes } });
      }
    } catch {}
    revalidatePath('/dashboard/admin/cuentas-por-cobrar');
    revalidatePath(`/dashboard/admin/cuentas-por-cobrar/${orderId}`);
    return { ok: true };
  } catch (e) {
    console.error('[sendReceivableReminder] error', e);
    try { await prisma.auditLog.create({ data: { userId: undefined, action: 'RECEIVABLE_REMINDER_FAILED', details: `order:${orderId} error:${String(e)}` } }); } catch {}
    return { ok: false, error: String(e) };
  }
}

export async function runReceivablesReminderJob() {
  // Find open receivables (PENDIENTE, PARCIAL) with bucket VENCIDA (>30 dÃ­as)
  const open = await prisma.receivable.findMany({
    where: { OR: [ { status: 'PENDIENTE' as any }, { status: 'PARCIAL' as any } ] },
    include: { order: { include: { user: true } }, entries: true },
  });
  let attempted = 0;
  let sent = 0;
  let tagged = 0;
  for (const r of open) {
    const baseDate = r.dueDate ? new Date(r.dueDate as any) : new Date((r.order as any).createdAt as any);
    const days = Math.floor((Date.now() - baseDate.getTime()) / (1000*60*60*24));
    if (days <= 30) continue; // only overdue
    const to = (r.order as any)?.user?.email as string | undefined;
    if (!to) continue;
    attempted++;
    try {
      const fd = new FormData();
      fd.set('orderId', r.orderId);
      const res: any = await sendReceivableReminder(fd as any);
      if (res?.ok) {
        sent++;
        // mark first overdue notification only once
        const already = (r.notes || '').includes('OVERDUE_NOTIFIED');
        if (!already) {
          const stamp = new Date().toISOString().slice(0,10);
          const notes = ((r.notes || '').trim() ? (r.notes + ' | ') : '') + `OVERDUE_NOTIFIED:${stamp}`;
          try { await prisma.receivable.update({ where: { id: r.id }, data: { notes } }); tagged++; } catch {}
        }
      }
    } catch {}
  }
  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  return { ok: true, attempted, sent, tagged };
}

export async function recordReceivableShare(formData: FormData) {
  const orderId = String(formData.get('orderId') || '');
  const viaRaw = String(formData.get('via') || '').toUpperCase();
  const via = (viaRaw === 'WHATSAPP' || viaRaw === 'EMAIL') ? viaRaw : 'WHATSAPP';
  if (!orderId) return { ok: false, error: 'Orden invÃ¡lida' };
  const stamp = new Date().toISOString().slice(0,10);
  try { await prisma.auditLog.create({ data: { userId: undefined, action: 'RECEIVABLE_SHARED', details: `order:${orderId} via:${via} date:${stamp}` } }); } catch {}
  try {
    const r = await prisma.receivable.findUnique({ where: { orderId } });
    if (r) {
      const newNotes = (((r.notes || '').trim() ? (r.notes + ' | ') : '') + `SHARED:${via}:${stamp}`).slice(0, 2000);
      await prisma.receivable.update({ where: { id: r.id }, data: { notes: newNotes } });
    }
  } catch {}
  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  revalidatePath(`/dashboard/admin/cuentas-por-cobrar/${orderId}`);
  return { ok: true };
}

export async function updateReceivableNotes(formData: FormData) {
  const orderId = String(formData.get('orderId') || '');
  const notes = String(formData.get('notes') || '').trim();
  if (!orderId) return { ok: false, error: 'Orden invlda' };
  let receivable = await prisma.receivable.findUnique({ where: { orderId } });
  if (!receivable) {
    receivable = await prisma.receivable.create({ data: { orderId, status: 'PENDIENTE' as any, notes: notes || null } });
  } else {
    await prisma.receivable.update({ where: { id: receivable.id }, data: { notes: notes || null } });
  }
  revalidatePath('/dashboard/admin/cuentas-por-cobrar');
  revalidatePath(`/dashboard/admin/cuentas-por-cobrar/${orderId}`);
  return { ok: true };
}



