import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { put } from '@vercel/blob';
import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';

function startOfDay(d: Date) { const x=new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x=new Date(d); x.setHours(23,59,59,999); return x; }

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session || (session.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let deliveryUserId = '' as string;
  let from = '' as string;
  let to = '' as string;
  let paymentMethod = '' as string;
  let paymentReference = '' as string;
  let paymentDate = '' as string; // ISO or yyyy-mm-dd
  let paymentNotes = '' as string;
  let proofUrl: string | null = null;

  const ct = (req.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => ({} as any));
    deliveryUserId = String(body?.deliveryUserId || '');
    from = String(body?.from || '');
    to = String(body?.to || '');
    paymentMethod = String(body?.paymentMethod || '');
    paymentReference = String(body?.paymentReference || '');
    paymentDate = String(body?.paymentDate || '');
    paymentNotes = String(body?.paymentNotes || '');
  } else {
    const fd = await req.formData().catch(() => null);
    if (fd) {
      deliveryUserId = String(fd.get('deliveryUserId') || '');
      from = String(fd.get('from') || '');
      to = String(fd.get('to') || '');
      paymentMethod = String(fd.get('paymentMethod') || '');
      paymentReference = String(fd.get('paymentReference') || '');
      paymentDate = String(fd.get('paymentDate') || '');
      paymentNotes = String(fd.get('paymentNotes') || '');
      const proof = fd.get('proof');
      if (proof && typeof proof === 'object' && 'arrayBuffer' in proof) {
        const file = proof as File;
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const cleanFrom = from.replace(/[^0-9-]/g, '');
        const cleanTo = to.replace(/[^0-9-]/g, '');
        const ext = (file.name || 'proof.pdf').split('.').pop() || 'pdf';
        const path = `payouts/delivery/${deliveryUserId}/${cleanFrom}_${cleanTo}/proof_${Date.now()}.${ext}`;
        const uploaded = await put(path, bytes, { access: 'public', contentType: file.type || 'application/octet-stream' });
        proofUrl = uploaded.url;
      }
    }
  }

  if (!deliveryUserId || !from || !to) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const fromDate = startOfDay(new Date(from));
  const toDate = endOfDay(new Date(to));

  const orders = await prisma.order.findMany({
    where: {
      shipping: { carrier: 'DELIVERY' as any, assignedToId: deliveryUserId, status: 'ENTREGADO' as any },
      shippingAddress: { is: { city: { equals: 'Barinas', mode: 'insensitive' } } as any },
      updatedAt: { gte: fromDate, lte: toDate },
    },
    include: { user: { select: { name: true, email: true } }, shipping: true },
    orderBy: { updatedAt: 'asc' },
  });

  // Only consider pending (unpaid) deliveries
  const pending = orders.filter(o => !o.shipping?.deliveryPaidAt);
  const orderIds = pending.map(o => o.id);

  // Create PDF payout file
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const driverPctRaw = (settings as any)?.deliveryDriverSharePct;
  const driverPct = ((): number => {
    const n = Number(driverPctRaw);
    if (!isFinite(n) || n <= 0 || n > 100) return 70;
    return n;
  })();

  const totalFee = pending.reduce((acc, o) => acc + parseFloat(String(o.shipping?.deliveryFeeUSD || 0)), 0);
  const totalDriver = totalFee * (driverPct / 100);
  const brandName = String(settings?.brandName || 'Carpihogar.ai');
  const primary = String((settings as any)?.primaryColor || '#0ea5e9');
  const logoUrl = (settings as any)?.logoUrl as string | undefined;
  const logoBuf = await (async () => {
    try {
      if (!logoUrl) return null;
      if (logoUrl.startsWith('http')) {
        const resp = await fetch(logoUrl);
        if (!resp.ok) return null;
        const arr = await resp.arrayBuffer();
        return Buffer.from(arr);
      } else {
        const trimmed = logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl;
        const fs = await import('fs');
        const path = await import('path');
        const p = path.join(process.cwd(), 'public', trimmed);
        if (fs.existsSync(p)) return fs.readFileSync(p);
      }
    } catch {}
    return null;
  })();
  const user = await prisma.user.findUnique({ where: { id: deliveryUserId }, select: { name: true, email: true } });
  const pdfDoc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  pdfDoc.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  const pdfReady = new Promise<Buffer>((resolve) => pdfDoc.on('end', () => resolve(Buffer.concat(chunks))));

  const header = () => {
    // Banda superior con marca
    pdfDoc.save();
    pdfDoc.rect(50, 28, 495, 26).fill(primary);
    pdfDoc.restore();
    if (logoBuf) {
      try { pdfDoc.image(logoBuf, 54, 32, { height: 18 }); } catch {}
    }
    pdfDoc.fillColor('#ffffff').fontSize(14).text(brandName, logoBuf ? 80 : 56, 34);
    pdfDoc.fillColor('#e6f4fb').fontSize(9).text('Comprobante de pago a Delivery', 400, 34, { width: 145, align: 'right' });
    pdfDoc.moveTo(50, 64).lineTo(545, 64).strokeColor('#eeeeee').stroke();
    pdfDoc.moveDown(0.5);
    pdfDoc.fillColor('#111');
    pdfDoc.fontSize(18).text('Pago a Delivery', { align: 'left' });
    pdfDoc.moveDown(0.5);
    pdfDoc.fontSize(11).text(`Delivery: ${user?.name || user?.email || deliveryUserId}`);
    if (user?.email) pdfDoc.text(`Email: ${user.email}`);
    pdfDoc.text(`Periodo: ${from} a ${to}`);
    pdfDoc.text(`Método: ${paymentMethod || '-'}   Referencia: ${paymentReference || '-'}`);
    pdfDoc.text(`Fecha de pago: ${paymentDate || '-'}`);
    if (paymentNotes) pdfDoc.text(`Notas: ${paymentNotes}`);
    pdfDoc.moveDown(0.75);
    pdfDoc.moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).strokeColor('#dddddd').stroke();
    pdfDoc.moveDown(0.5);
  };

  const tableHeader = () => {
    pdfDoc.font('Helvetica-Bold').fontSize(11);
    const y = pdfDoc.y;
    // Fondo encabezado
    pdfDoc.save();
    pdfDoc.rect(50, y - 2, 495, 16).fill(primary);
    pdfDoc.restore();
    pdfDoc.fillColor('#fff');
    pdfDoc.text('Fecha', 54, y);
    pdfDoc.text('Orden', 164, y);
    pdfDoc.text('Cliente', 234, y, { width: 240 });
    pdfDoc.text('Pago (USD)', 484, y, { width: 60, align: 'right' });
    pdfDoc.moveDown(1);
    pdfDoc.fillColor('#111');
  };

  header();
  tableHeader();

  // Single-page layout: calcula filas máximas para que quede en una sola hoja
  const pageBottom = (pdfDoc as any).page.height - 50; // margen inferior
  const startY = (pdfDoc as any).y;
  const rowH = 12; // altura por fila
  const maxRows = Math.max(1, Math.floor((pageBottom - startY - 70) / rowH)); // deja espacio para total y footer
  let running = 0;
  const rows = pending.slice(0, maxRows);
  for (const o of rows) {
    const fee = parseFloat(String(o.shipping?.deliveryFeeUSD || 0));
    const driverAmount = fee * (driverPct / 100);
    running += driverAmount;
    const fecha = new Date((o as any).updatedAt).toLocaleString('es-VE');
    const cliente = (o.user?.name || o.user?.email || '').toString();
    pdfDoc.font('Helvetica').fontSize(9);
    pdfDoc.text(fecha, 50, (pdfDoc as any).y, { width: 100 });
    pdfDoc.text(o.id.slice(0, 8), 160, (pdfDoc as any).y, { width: 60 });
    pdfDoc.text(cliente, 230, (pdfDoc as any).y, { width: 240 });
    pdfDoc.text(driverAmount.toFixed(2), 480, (pdfDoc as any).y, { width: 80, align: 'right' });
    pdfDoc.moveDown(0.2);
  }

  const omitted = pending.length - rows.length;
  if (omitted > 0) {
    pdfDoc.moveDown(0.2);
    pdfDoc.fontSize(9).fillColor('#555').text(`+${omitted} entregas adicionales en el periodo (resumidas para mantener 1 página).`, 50, (pdfDoc as any).y);
    pdfDoc.fillColor('#111');
  }

  pdfDoc.moveDown(0.4);
  pdfDoc.moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).strokeColor('#cccccc').stroke();
  pdfDoc.moveDown(0.4);
  pdfDoc.font('Helvetica-Bold').fontSize(12).text('Total a pagar (USD):', 300, pdfDoc.y, { width: 170, align: 'right' });
  pdfDoc.font('Helvetica-Bold').fontSize(12).text(running.toFixed(2), 480, pdfDoc.y, { width: 80, align: 'right' });
  // Footer de contacto
  pdfDoc.moveDown(0.8);
  const contact = `${(settings as any)?.contactEmail || ''}  ${(settings as any)?.contactPhone || ''}`.trim();
  if (contact) {
    pdfDoc.fontSize(8).fillColor('#666').text(contact, 50, Math.min((pdfDoc as any).y + 6, pageBottom - 10), { width: 495, align: 'center' });
    pdfDoc.fillColor('#111');
  }

  pdfDoc.end();
  const pdfBuffer = await pdfReady;
  const pdfPath = `payouts/delivery/${deliveryUserId}/${from.replace(/[^0-9-]/g, '')}_${to.replace(/[^0-9-]/g, '')}/payout_${Date.now()}.pdf`;
  const pdfUpload = await put(pdfPath, pdfBuffer as any, { access: 'public', contentType: 'application/pdf' });

  // Mark as paid and record observation
  const now = new Date();
  const obs = `[PAGO DELIVERY] metodo=${paymentMethod || ''}; ref=${paymentReference || ''}; fecha=${paymentDate || ''}; pdf=${pdfUpload.url}; proof=${proofUrl || ''}; notas=${paymentNotes || ''}`;
  let updated = 0;
  if (orderIds.length > 0) {
    const result = await prisma.shipping.updateMany({ where: { orderId: { in: orderIds } }, data: { deliveryPaidAt: now as any, observations: obs } });
    updated = result.count;
  }

  return NextResponse.json({ updated, totalUSD: totalDriver, pdfUrl: pdfUpload.url, proofUrl, count: orderIds.length });
}
