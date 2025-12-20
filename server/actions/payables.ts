'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { getDeleteSecret } from '@/server/actions/settings';
import { ensureSupplierColumns } from '@/server/actions/procurement';

async function recalcPayable(id: string) {
  const payable = await prisma.payable.findUnique({
    where: { id },
    include: { entries: true },
  });
  if (!payable) return;
  const abonadoUSD = (payable.entries || []).reduce(
    (acc, e: any) => acc + Number(e.amountUSD || 0),
    0,
  );
  const totalUSD = Number(payable.totalUSD || 0);
  const balanceUSD = Math.max(0, totalUSD - abonadoUSD);
  let status: any = 'PENDIENTE';
  if (balanceUSD <= 0.01) status = 'PAGADO';
  else if (abonadoUSD > 0) status = 'PARCIAL';
  await prisma.payable.update({
    where: { id },
    data: {
      status,
      balanceUSD: balanceUSD as any,
    },
  });
}

export async function generatePayablePdf(full: {
  payable: any;
  purchase?: any | null;
  supplier?: any | null;
}): Promise<Buffer> {
  const { payable, purchase, supplier } = full;
  const PDFDocument = (
    await import('pdfkit/js/pdfkit.standalone.js')
  ).default as any;
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const chunks: Buffer[] = [];
  const stream = doc as any;
  stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
  const done = new Promise<Buffer>((resolve) =>
    stream.on('end', () => resolve(Buffer.concat(chunks))),
  );

  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: 1 },
    });
    const logoUrl = (settings as any)?.logoUrl as string | undefined;
    if (logoUrl) {
      if (logoUrl.startsWith('http')) {
        try {
          const res = await fetch(logoUrl);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            (doc as any).image(buf, 36, 24, { fit: [160, 60] });
          }
        } catch {
          // ignore logo fetch errors
        }
      } else {
        const { promises: fs } = await import('fs');
        const path = (await import('path')).default;
        const trimmed = logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl;
        const filePath = path.join(process.cwd(), 'public', trimmed);
        try {
          const buf = await fs.readFile(filePath);
          (doc as any).image(buf, 36, 24, { fit: [160, 60] });
        } catch {
          // ignore local logo errors
        }
      }
    }
  } catch {
    // ignore settings/logo errors
  }

  const totalUSD = Number(payable.totalUSD || 0);
  const entries = payable.entries || [];
  const abonadoUSD = entries.reduce(
    (a: number, e: any) => a + Number(e.amountUSD || 0),
    0,
  );
  const saldoUSD = Math.max(0, totalUSD - abonadoUSD);
  const vence = (payable.dueDate || null) as Date | null;

  doc.moveDown(0.5);
  doc
    .fontSize(16)
    .text(
      `Cuenta por Pagar - ${
        supplier?.name || supplier?.contactName || 'Proveedor'
      }`,
    );
  doc.moveDown(0.5);
  if (purchase) {
    if (purchase.invoiceNumber) {
      doc
        .fontSize(11)
        .text(`Factura: ${String(purchase.invoiceNumber || '')}`);
    }
    doc
      .fontSize(11)
      .text(`Compra ID: ${purchase.id || payable.purchaseId || ''}`);
    if (purchase.invoiceDate) {
      doc.text(
        `Fecha factura: ${new Date(
          purchase.invoiceDate as any,
        ).toLocaleDateString()}`,
      );
    }
  } else {
    doc
      .fontSize(11)
      .text(`Compra ID: ${payable.purchaseId || '(sin compra vinculada)'}`);
  }

  if (supplier) {
    doc.text(
      `Proveedor: ${supplier.name || supplier.contactName || '(sin nombre)'}`,
    );
    if (supplier.taxId) doc.text(`RIF: ${supplier.taxId}`);
    if (supplier.email) doc.text(`Email: ${supplier.email}`);
    if (supplier.phone) doc.text(`Teléfono: ${supplier.phone}`);
  }

  doc.moveDown(0.5);
  doc.text(`Total USD: $${totalUSD.toFixed(2)}`);
  doc.text(`Pagado USD: $${abonadoUSD.toFixed(2)}`);
  doc.text(`Saldo USD: $${saldoUSD.toFixed(2)}`);
  if (vence) {
    doc.text(
      `Vence: ${new Date(vence as any).toLocaleDateString()}`,
    );
  }
  if (payable.notes) {
    doc.moveDown(0.5).text(`Notas: ${String(payable.notes)}`);
  }

  doc.moveDown(1);
  doc.fontSize(13).text('Detalle de pagos');
  doc.moveDown(0.5);
  doc.fontSize(11);
  if (!entries.length) {
    doc.text('Sin pagos registrados');
  } else {
    for (const e of entries) {
      const d = new Date((e as any).createdAt as any).toLocaleDateString();
      const line = `${d}  $${Number((e as any).amountUSD).toFixed(
        2,
      )}  ${(e as any).currency || ''}  ${(e as any).method || ''}  Ref: ${
        (e as any).reference || ''
      }`;
      doc.text(line);
      if ((e as any).notes) doc.text(`Notas: ${(e as any).notes}`);
    }
  }

  doc.end();
  return done;
}

export async function getPayables(filters?: {
  status?: string;
  supplierId?: string;
  from?: string;
  to?: string;
  invoice?: string;
}) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    throw new Error('Not authorized');
  }
  await ensureSupplierColumns();
  const where: any = {};
  if (filters?.status) {
    const st = String(filters.status).toUpperCase();
    if (['PENDIENTE', 'PARCIAL', 'PAGADO', 'CANCELADO'].includes(st)) {
      where.status = st as any;
    }
  }
  if (filters?.supplierId) {
    where.supplierId = String(filters.supplierId);
  }

  // Filtro por número de factura / compra
  if (filters?.invoice) {
    const inv = String(filters.invoice);
    const matches = await prisma.purchase.findMany({
      where: {
        OR: [
          { invoiceNumber: { contains: inv, mode: 'insensitive' } as any },
          { id: { contains: inv } as any },
        ],
      },
      select: { id: true },
    });
    const ids = matches.map((p) => p.id);
    if (!ids.length) return [];
    where.purchaseId = { in: ids };
  }
  if (filters?.from || filters?.to) {
    const createdAt: any = {};
    if (filters.from) {
      const d = new Date(String(filters.from));
      if (!isNaN(d.getTime())) createdAt.gte = d as any;
    }
    if (filters.to) {
      const d = new Date(String(filters.to));
      if (!isNaN(d.getTime())) {
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        createdAt.lt = next as any;
      }
    }
    if (Object.keys(createdAt).length) where.createdAt = createdAt;
  }
  const payables = await prisma.payable.findMany({
    where,
    include: { entries: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const purchaseIds = payables.map((p) => p.purchaseId).filter(Boolean) as string[];
  const supplierIds = payables
    .map((p) => p.supplierId)
    .filter((id: any) => typeof id === 'string' && id.length) as string[];

  const [purchases, suppliers] = await Promise.all([
    purchaseIds.length
      ? prisma.purchase.findMany({ where: { id: { in: purchaseIds } } })
      : Promise.resolve([]),
    supplierIds.length
      ? prisma.supplier.findMany({ where: { id: { in: supplierIds } } })
      : Promise.resolve([]),
  ]);

  const purchaseMap = new Map(purchases.map((p: any) => [p.id, p]));
  const supplierMap = new Map(suppliers.map((s: any) => [s.id, s]));

  // Enriquecer cada payable con supplier y purchase para la UI
  return payables.map((p: any) => ({
    ...p,
    purchase: purchaseMap.get(p.purchaseId) || null,
    supplier: p.supplierId ? supplierMap.get(p.supplierId) || null : null,
  }));
}

export async function addPayablePayment(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    throw new Error('Not authorized');
  }
  const payableId = String(formData.get('payableId') || '');
  if (!payableId) throw new Error('ID inválido');
  const currency = String(formData.get('currency') || 'USD').toUpperCase() as
    | 'USD'
    | 'VES'
    | 'USDT';
  const method = String(formData.get('method') || '') || null;
  const reference = String(formData.get('reference') || '') || null;
  const notes = String(formData.get('notes') || '') || null;
  const bankAccountIdRaw = String(formData.get('bankAccountId') || '') || null;
  const amountStr = String(formData.get('amount') || '0');
  const amount = Number(amountStr);
  if (!amount || amount <= 0) {
    throw new Error('Monto inválido');
  }

  const payable = await prisma.payable.findUnique({
    where: { id: payableId },
  });
  if (!payable) throw new Error('Cuenta por pagar no encontrada');

  await prisma.payableEntry.create({
    data: {
      payableId,
      amountUSD: amount as any,
      currency: currency as any,
      method: method as any,
      bankAccountId: bankAccountIdRaw || null,
      reference,
      notes,
    },
  });

  if (bankAccountIdRaw) {
    try {
      await prisma.bankTransaction.create({
        data: {
          bankAccountId: bankAccountIdRaw,
          type: 'DEBITO' as any,
          amount: amount as any,
          currency: currency as any,
          description: `Pago proveedor ${payable.supplierId || ''}`.trim(),
          reference,
          purchaseId: payable.purchaseId,
        },
      });
    } catch (e) {
      console.error('[payables] bankTransaction error', e);
    }
  }

  await recalcPayable(payableId);
  revalidatePath('/dashboard/admin/cuentas-por-pagar');
}

export async function updatePayableDueDate(formData: FormData) {
  const payableId = String(formData.get('payableId') || '');
  const dueDateStr = String(formData.get('dueDate') || '');
  const dueDate = dueDateStr ? new Date(dueDateStr) : null;
  if (!payableId) {
    return { ok: false, error: 'Cuenta por pagar inválida' } as any;
  }
  await prisma.payable.update({
    where: { id: payableId },
    data: { dueDate },
  });
  revalidatePath('/dashboard/admin/cuentas-por-pagar');
  revalidatePath(`/dashboard/admin/cuentas-por-pagar/${payableId}`);
  return { ok: true } as any;
}

export async function updatePayableNotes(formData: FormData) {
  const payableId = String(formData.get('payableId') || '');
  const notes = String(formData.get('notes') || '').trim();
  if (!payableId) {
    return { ok: false, error: 'Cuenta por pagar inválida' } as any;
  }
  await prisma.payable.update({
    where: { id: payableId },
    data: { notes: notes || null },
  });
  revalidatePath('/dashboard/admin/cuentas-por-pagar');
  revalidatePath(`/dashboard/admin/cuentas-por-pagar/${payableId}`);
  return { ok: true } as any;
}

export async function updatePayableEntry(formData: FormData) {
  const entryId = String(formData.get('entryId') || '');
  const payableId = String(formData.get('payableId') || '');
  const amount = Number(String(formData.get('amount') || '0'));
  const currency = String(
    formData.get('currency') || 'USD',
  ).toUpperCase() as any;
  const method = String(formData.get('method') || '') || null;
  const reference = String(formData.get('reference') || '') || null;
  const notes = String(formData.get('notes') || '') || null;
  const paidAtStr = String(formData.get('paidAt') || '').trim();
  const createdAt = paidAtStr ? new Date(paidAtStr) : undefined;

  if (!entryId) {
    return { ok: false, error: 'Entrada inválida' } as any;
  }
  const entry = await prisma.payableEntry.findUnique({
    where: { id: entryId },
    include: { payable: true },
  });
  if (!entry) {
    return { ok: false, error: 'Entrada no encontrada' } as any;
  }
  if (!amount || amount <= 0) {
    return { ok: false, error: 'Monto inválido' } as any;
  }

  await prisma.payableEntry.update({
    where: { id: entryId },
    data: {
      amountUSD: amount as any,
      currency,
      method: method as any,
      reference,
      notes,
      ...(createdAt ? { createdAt: createdAt as any } : {}),
    },
  });

  await recalcPayable(entry.payableId || payableId);
  revalidatePath('/dashboard/admin/cuentas-por-pagar');
  revalidatePath(
    `/dashboard/admin/cuentas-por-pagar/${entry.payableId || payableId}`,
  );
  return { ok: true } as any;
}

export async function deletePayableEntry(formData: FormData) {
  const entryId = String(formData.get('entryId') || '');
  let payableId = String(formData.get('payableId') || '');
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
  if (!entryId) {
    return { ok: false, error: 'Entrada inválida' } as any;
  }

  const entry = await prisma.payableEntry.findUnique({
    where: { id: entryId },
    include: { payable: true },
  });
  if (entry?.payableId) {
    payableId = entry.payableId;
  }

  await prisma.payableEntry.delete({
    where: { id: entryId },
  });
  if (payableId) {
    await recalcPayable(payableId);
  }
  revalidatePath('/dashboard/admin/cuentas-por-pagar');
  if (payableId) {
    revalidatePath(`/dashboard/admin/cuentas-por-pagar/${payableId}`);
  }
  return { ok: true } as any;
}

export async function markPayablePaid(formData: FormData) {
  const payableId = String(formData.get('payableId') || '');
  if (!payableId) {
    return { ok: false, error: 'Cuenta por pagar inválida' } as any;
  }
  await prisma.payable.update({
    where: { id: payableId },
    data: {
      status: 'PAGADO' as any,
      balanceUSD: 0 as any,
    },
  });
  revalidatePath('/dashboard/admin/cuentas-por-pagar');
  revalidatePath(`/dashboard/admin/cuentas-por-pagar/${payableId}`);
  return { ok: true } as any;
}

export async function recordPayableShare(formData: FormData) {
  const payableId = String(formData.get('payableId') || '');
  const viaRaw = String(formData.get('via') || '').toUpperCase();
  const via = viaRaw === 'EMAIL' ? 'EMAIL' : 'WHATSAPP';
  if (!payableId) {
    return { ok: false, error: 'Cuenta por pagar inválida' } as any;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    await prisma.auditLog.create({
      data: {
        userId: undefined,
        action: 'PAYABLE_SHARED',
        details: `payable:${payableId} via:${via} date:${stamp}`,
      },
    });
  } catch {
    // ignore audit errors
  }
  try {
    const p = await prisma.payable.findUnique({ where: { id: payableId } });
    if (p) {
      const newNotes = (
        ((p.notes || '').trim() ? p.notes + ' | ' : '') +
        `SHARED:${via}:${stamp}`
      ).slice(0, 2000);
      await prisma.payable.update({
        where: { id: payableId },
        data: { notes: newNotes },
      });
    }
  } catch {
    // ignore notes errors
  }
  revalidatePath('/dashboard/admin/cuentas-por-pagar');
  revalidatePath(`/dashboard/admin/cuentas-por-pagar/${payableId}`);
  return { ok: true } as any;
}

export async function sendPayableStatement(formData: FormData) {
  const payableId = String(formData.get('payableId') || '');
  if (!payableId) {
    return { ok: false, error: 'Cuenta por pagar inválida' } as any;
  }
  const payable = await prisma.payable.findUnique({
    where: { id: payableId },
    include: { entries: true },
  });
  if (!payable) {
    return { ok: false, error: 'Cuenta por pagar no encontrada' } as any;
  }

  const purchase = payable.purchaseId
    ? await prisma.purchase.findUnique({
        where: { id: payable.purchaseId },
        include: { supplier: true },
      })
    : null;
  const supplier = purchase?.supplier ?? null;
  const to = (supplier as any)?.email as string | undefined;
  if (!to) {
    return { ok: false, error: 'Proveedor sin email' } as any;
  }

  const settings = await prisma.siteSettings.findUnique({
    where: { id: 1 },
  });
  const brand = (settings as any)?.brandName || 'Carpihogar.ai';

  const totalUSD = Number(payable.totalUSD || 0);
  const abonadoUSD = (payable.entries || []).reduce(
    (acc, e: any) => acc + Number(e.amountUSD || 0),
    0,
  );
  const saldoUSD = Math.max(0, totalUSD - abonadoUSD);
  const due = payable.dueDate || null;

  const subject = `${brand} - Estado de cuenta por pagar ${payableId.slice(
    -6,
  )}`;
  const lines: string[] = [];
  lines.push(`Estimado proveedor,`);
  lines.push(
    `\nAdjuntamos el estado de cuenta correspondiente a la factura/compra asociada.`,
  );
  if (purchase) {
    lines.push(
      `Compra: ${purchase.id}${
        purchase.invoiceNumber
          ? ` | Factura: ${String(purchase.invoiceNumber)}`
          : ''
      }`,
    );
    if (purchase.invoiceDate) {
      lines.push(
        `Fecha factura: ${new Date(
          purchase.invoiceDate as any,
        ).toLocaleDateString()}`,
      );
    }
  }
  lines.push(
    `Total: $${totalUSD.toFixed(2)} | Pagado: $${abonadoUSD.toFixed(
      2,
    )} | Saldo: $${saldoUSD.toFixed(2)}`,
  );
  if (due) {
    lines.push(
      `Vencimiento: ${new Date(due as any).toLocaleDateString()}`,
    );
  }
  if (payable.notes) {
    lines.push(`\nNotas internas: ${String(payable.notes)}`);
  }
  lines.push(
    `\nSi observa alguna diferencia, por favor responda a este correo.`,
  );

  const text = lines.join('\n');
  const html = text.replace(/\n/g, '<br/>');

  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT || '';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  const port = Number(portStr || '587');
  if (!host || !user || !pass || !from || !port) {
    return {
      ok: false,
      error:
        'SMTP no configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM',
    } as any;
  }

  try {
    const nodemailer = (await import('nodemailer')).default as any;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    const attachments: any[] = [];
    try {
      const pdf = await generatePayablePdf({
        payable,
        purchase,
        supplier,
      });
      attachments.push({
        filename: `cxp_${payableId}.pdf`,
        content: pdf,
      });
    } catch {
      // ignore pdf errors, still send email
    }
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      attachments,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    try {
      await prisma.auditLog.create({
        data: {
          userId: undefined,
          action: 'PAYABLE_STATEMENT_SENT',
          details: `payable:${payableId} via:EMAIL date:${stamp}`,
        },
      });
    } catch {
      // ignore audit errors
    }
    try {
      const newNotes = (
        ((payable.notes || '').trim() ? payable.notes + ' | ' : '') +
        `SHARED:EMAIL:${stamp}`
      ).slice(0, 2000);
      await prisma.payable.update({
        where: { id: payableId },
        data: { notes: newNotes },
      });
    } catch {
      // ignore notes errors
    }

    revalidatePath('/dashboard/admin/cuentas-por-pagar');
    revalidatePath(`/dashboard/admin/cuentas-por-pagar/${payableId}`);
    return { ok: true } as any;
  } catch (e) {
    console.error('[sendPayableStatement] error', e);
    try {
      await prisma.auditLog.create({
        data: {
          userId: undefined,
          action: 'PAYABLE_STATEMENT_FAILED',
          details: `payable:${payableId} error:${String(e)}`,
        },
      });
    } catch {
      // ignore audit errors
    }
    return { ok: false, error: String(e) } as any;
  }
}
