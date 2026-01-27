'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSettings, getDeleteSecret } from '@/server/actions/settings';

export async function ensureSupplierColumns() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "public"."Supplier" ' +
      'ADD COLUMN IF NOT EXISTS "chargeCurrency" "Currency" NOT NULL DEFAULT \'USD\''
    );
  } catch {}
}

function parseCsv(text: string, delimiter?: string): Array<Record<string,string>> {
  const dl = delimiter && delimiter.length ? delimiter : (text.indexOf(';') > -1 ? ';' : ',');
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const header = lines[0];
  const headers: string[] = [];
  // Simple CSV header parse (supports quotes)
  {
    let cur = '';
    let inQ = false;
    for (let i = 0; i < header.length; i++) {
      const ch = header[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (!inQ && ch === dl) { headers.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    headers.push(cur.trim());
  }
  const rows: Array<Record<string,string>> = [];
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    let cur = '';
    let inQ = false;
    const cols: string[] = [];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (!inQ && ch === dl) { cols.push(cur); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur);
    const rec: Record<string,string> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = String(headers[i] || '').trim();
      rec[key] = (cols[i] ?? '').trim();
    }
    rows.push(rec);
  }
  return rows;
}

function pick(obj: Record<string,string>, names: string[]): string | undefined {
  for (const n of names) {
    const k = Object.keys(obj).find(h => h.toLowerCase().replace(/\s+/g,'') === n.toLowerCase().replace(/\s+/g,''));
    if (k && obj[k]) return obj[k];
  }
  return undefined;
}

export async function importPurchasesCsv(form: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const file = form.get('file') as unknown as File | null;
  if (!file) throw new Error('Archivo CSV requerido');
  const supplierId = String(form.get('supplierId') || '') || undefined;
  const currency = String(form.get('currency') || 'USD').toUpperCase();
  // Siempre usamos la tasa oficial almacenada en SiteSettings (BCV)
  const settings = await getSettings();
  const tasaVES = Number((settings as any).tasaVES || 0) || 0;
  const notes = String(form.get('notes') || '') || undefined;
  const delimiter = String(form.get('delimiter') || '') || undefined;

  const text = await (file as any).text();
  const rows = parseCsv(text, delimiter);
  if (!rows.length) throw new Error('CSV vacío');

  const defClient = Number((settings as any).defaultMarginClientPct ?? 40);
  const defAlly = Number((settings as any).defaultMarginAllyPct ?? 30);
  const defWholesale = Number((settings as any).defaultMarginWholesalePct ?? 20);

  type Line = { productId?: string; code?: string|null; name: string; quantity: number; costUSD: number; marginClientPct: number; marginAllyPct: number; marginWholesalePct: number };
  const items: Line[] = [];

  for (const r of rows) {
    const code = pick(r, ['code','sku','barcode','código','codigo']) || null;
    const name = (pick(r, ['name','producto','product']) || '').trim();
    const qtyStr = pick(r, ['quantity','qty','cantidad','cant']) || '0';
    const costStr = pick(r, ['costUSD','cost','unitCost','costo','costoUSD']) || '0';
    const quantity = Number(qtyStr.replace(',','.'));
    let costUSD = Number(costStr.replace(',','.'));
    if (currency === 'VES' && tasaVES > 0) costUSD = costUSD / tasaVES;
    if (!name || !quantity) continue;

    // Try to find existing product
    let product: any = null;
    if (code) {
      const digits = code.replace(/\D/g, '');
      product = await prisma.product.findFirst({
        where: { OR: [ { code: code }, { sku: code }, ...(digits.length >= 6 ? [{ barcode: digits }] : []) ] },
        select: { id: true, name: true, marginClientPct: true, marginAllyPct: true, marginWholesalePct: true },
      });
    }
    if (!product) {
      product = await prisma.product.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true, name: true, marginClientPct: true, marginAllyPct: true, marginWholesalePct: true } });
    }
    const marginClientPct = product?.marginClientPct ? Number(product.marginClientPct) : defClient;
    const marginAllyPct = product?.marginAllyPct ? Number(product.marginAllyPct) : defAlly;
    const marginWholesalePct = product?.marginWholesalePct ? Number(product.marginWholesalePct) : defWholesale;

    items.push({ productId: product?.id, code, name, quantity, costUSD, marginClientPct, marginAllyPct, marginWholesalePct });
  }

  if (!items.length) throw new Error('No hay filas válidas');

  // Create purchase and update products similar to /api/purchases/save
  let subtotalUSD = 0; for (const it of items) subtotalUSD += Number(it.quantity) * Number(it.costUSD);
  const purchase = await prisma.purchase.create({ data: { supplierId: supplierId || null, currency: (currency as any), tasaVES: (tasaVES || 0) as any, subtotalUSD: subtotalUSD as any, totalUSD: subtotalUSD as any, notes: notes || null, createdById: (session?.user as any)?.id } });
  for (const it of items) {
    const priceClientUSD = Number((it.costUSD * (1 + it.marginClientPct / 100)).toFixed(2));
    const priceAllyUSD = Number((it.costUSD * (1 + it.marginAllyPct / 100)).toFixed(2));
    const priceWholesaleUSD = Number((it.costUSD * (1 + it.marginWholesalePct / 100)).toFixed(2));
    if (it.productId) {
      const p = await prisma.product.findUnique({ where: { id: it.productId } });
      if (p) {
        const oldStock = Number(p.stock || 0);
        const oldAvg = Number(p.avgCost || p.costUSD || it.costUSD || 0);
        const newAvg = (oldStock * oldAvg + Number(it.quantity) * Number(it.costUSD)) / Math.max(1, oldStock + Number(it.quantity));
        await prisma.product.update({ where: { id: p.id }, data: { lastCost: it.costUSD as any, costUSD: it.costUSD as any, avgCost: newAvg as any, marginClientPct: it.marginClientPct as any, marginAllyPct: it.marginAllyPct as any, marginWholesalePct: it.marginWholesalePct as any, priceClientUSD: priceClientUSD as any, priceUSD: priceClientUSD as any, priceAllyUSD: priceAllyUSD as any, priceWholesaleUSD: priceWholesaleUSD as any, stock: { increment: Number(it.quantity) } } });
      }
    } else {
      const created = await prisma.product.create({ data: { name: it.name, slug: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`, brand: 'Sin marca', images: [], sku: it.code || null, code: it.code || null, stock: Number(it.quantity), supplierId: supplierId || null, costUSD: it.costUSD as any, lastCost: it.costUSD as any, avgCost: it.costUSD as any, marginClientPct: it.marginClientPct as any, marginAllyPct: it.marginAllyPct as any, marginWholesalePct: it.marginWholesalePct as any, priceClientUSD: priceClientUSD as any, priceUSD: priceClientUSD as any, priceAllyUSD: priceAllyUSD as any, priceWholesaleUSD: priceWholesaleUSD as any }, select: { id: true } });
      it.productId = created.id;
    }
    const subtotal = Number(it.quantity) * Number(it.costUSD);
    await prisma.purchaseItem.create({ data: { purchaseId: purchase.id, productId: String(it.productId), name: it.name, quantity: Number(it.quantity), costUSD: Number(it.costUSD) as any, subtotalUSD: subtotal as any } });
    await prisma.stockMovement.create({ data: { productId: String(it.productId), type: 'ENTRADA' as any, quantity: Number(it.quantity), reason: `PURCHASE ${purchase.id}`, userId: (session?.user as any)?.id } });
  }
  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'PURCHASE_IMPORT_CSV', details: purchase.id } }); } catch {}
  revalidatePath('/dashboard/admin/compras');
  return { ok: true, id: purchase.id } as any;
}

export async function getPurchases(filters?: { q?: string; supplierId?: string; from?: string; to?:string }) {
  try {
    const session = await getServerSession(authOptions);
    const role = String((session?.user as any)?.role || '');
    if (!['ADMIN','VENDEDOR'].includes(role)) throw new Error('Not authorized');
    await ensureSupplierColumns();
    const where: any = {};
    if (filters?.q) {
      const q = String(filters.q);
      where.OR = [
        { id: { contains: q } },
        { id: { endsWith: q } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (filters?.supplierId) where.supplierId = String(filters.supplierId);
    if (filters?.from || filters?.to) {
      const createdAt: any = {};
      if (filters?.from) {
        const d = new Date(String(filters.from));
        if (!isNaN(d.getTime())) createdAt.gte = d as any;
      }
      if (filters?.to) {
        const d = new Date(String(filters.to));
        if (!isNaN(d.getTime())) { const next = new Date(d); next.setDate(next.getDate() + 1); createdAt.lt = next as any; }
      }
      if (Object.keys(createdAt).length) where.createdAt = createdAt;
    }
    return prisma.purchase.findMany({ where, include: { supplier: true, items: true, createdBy: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  } catch (error) {
    console.error("Error fetching purchases:", error);
    return [];
  }
}

export async function getPurchaseById(id: string) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || '');
  if (!['ADMIN','VENDEDOR'].includes(role)) throw new Error('Not authorized');
  await ensureSupplierColumns();
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: { include: { product: true } },
      createdBy: true,
      bankTransactions: true,
    },
  });
  return purchase;
}

export async function getSuppliers() {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
    await ensureSupplierColumns();
    return prisma.supplier.findMany({ orderBy: { createdAt: 'desc' } });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return [];
  }
}

export async function updatePurchaseByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    throw new Error('Not authorized');
  }
  const id = String(formData.get('purchaseId') || '').trim();
  if (!id) {
    throw new Error('Compra inválida');
  }
  const invoiceNumberRaw = String(formData.get('invoiceNumber') || '').trim();
  const invoiceNumber = invoiceNumberRaw || null;
  const invoiceDateStr = String(formData.get('invoiceDate') || '').trim();
  let invoiceDate: Date | null = null;
  if (invoiceDateStr) {
    const d = new Date(invoiceDateStr);
    if (!isNaN(d.getTime())) invoiceDate = d;
  }
  const notesRaw = String(formData.get('notes') || '').trim();
  const notes = notesRaw || null;
  const baseAmountRaw = String(formData.get('baseAmountUSD') || '').trim();
  const discountPercentRaw = String(formData.get('discountPercent') || '').trim();
  const ivaPercentRaw = String(formData.get('ivaPercent') || '').trim();
  const ivaAmountRaw = String(formData.get('ivaAmountUSD') || '').trim();
  const totalUsdRaw = String(formData.get('totalUSD') || '').trim();
  const igtfPercentRaw = String(formData.get('igtfPercent') || '').trim();
  const igtfAmountRaw = String(formData.get('igtfAmountUSD') || '').trim();

  const baseAmountUSD = baseAmountRaw ? Number(baseAmountRaw) : undefined;
  const discountPercent = discountPercentRaw ? Number(discountPercentRaw) : undefined;
  const ivaPercent = ivaPercentRaw ? Number(ivaPercentRaw) : undefined;
  const ivaAmountUSD = ivaAmountRaw ? Number(ivaAmountRaw) : undefined;
  const totalUSD = totalUsdRaw ? Number(totalUsdRaw) : undefined;
  const igtfPercent = igtfPercentRaw ? Number(igtfPercentRaw) : undefined;
  const igtfAmountUSD = igtfAmountRaw ? Number(igtfAmountRaw) : undefined;

  await prisma.purchase.update({
    where: { id },
    data: {
      invoiceNumber,
      invoiceDate: invoiceDate as any,
      notes,
      ...(baseAmountUSD !== undefined ? { baseAmountUSD: baseAmountUSD as any } : {}),
      ...(discountPercent !== undefined ? { discountPercent: discountPercent as any } : {}),
      ...(ivaPercent !== undefined ? { ivaPercent: ivaPercent as any } : {}),
      ...(ivaAmountUSD !== undefined ? { ivaAmountUSD: ivaAmountUSD as any } : {}),
      ...(totalUSD !== undefined ? { totalUSD: totalUSD as any } : {}),
      ...(igtfPercent !== undefined ? { igtfPercent: igtfPercent as any } : {}),
      ...(igtfAmountUSD !== undefined ? { igtfAmountUSD: igtfAmountUSD as any } : {}),
    },
  });

  try {
    await prisma.auditLog.create({
      data: {
        userId: (session?.user as any)?.id,
        action: 'PURCHASE_UPDATE',
        details: id,
      },
    });
  } catch {}

  try { revalidatePath('/dashboard/admin/compras'); } catch {}
  try { revalidatePath(`/dashboard/admin/compras/ia/${id}`); } catch {}
  redirect(`/dashboard/admin/compras/ia/${id}?message=Datos%20actualizados`);
}

export async function deletePurchaseByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    throw new Error('Not authorized');
  }
  const id = String(formData.get('purchaseId') || '').trim();
  if (!id) {
    throw new Error('Compra inválida');
  }
  const secret = String(formData.get('secret') || '').trim();
  const configured = await getDeleteSecret();
  if (!configured) {
    throw new Error('Falta configurar la clave de eliminación');
  }
  if (secret !== configured) {
    throw new Error('Clave secreta inválida');
  }

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      items: true,
      bankTransactions: true,
    },
  });
  if (!purchase) {
    throw new Error('Compra no encontrada');
  }

  await prisma.$transaction(async (tx) => {
    // Revertir stock con un movimiento de SALIDA y decremento de stock
    for (const it of purchase.items as any[]) {
      try {
        await tx.stockMovement.create({
          data: {
            productId: it.productId,
            type: 'SALIDA' as any,
            quantity: Number(it.quantity),
            reason: `PURCHASE_DELETE ${id}`,
            userId: (session?.user as any)?.id,
          },
        });
      } catch {}
      try {
        await tx.product.update({
          where: { id: it.productId },
          data: {
            stock: { decrement: Number(it.quantity) },
            stockUnits: { decrement: Number(it.quantity) } as any,
          },
        });
      } catch {}
    }

    // Eliminar registros dependientes: items, movimientos bancarios y CxP
    await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
    await tx.bankTransaction.deleteMany({ where: { purchaseId: id } });
    await tx.payableEntry.deleteMany({
      where: { payable: { purchaseId: id } },
    });
    await tx.payable.deleteMany({ where: { purchaseId: id } });

    await tx.purchase.delete({ where: { id } });
  });

  try {
    await prisma.auditLog.create({
      data: {
        userId: (session?.user as any)?.id,
        action: 'PURCHASE_DELETE',
        details: id,
      },
    });
  } catch {}

  try { revalidatePath('/dashboard/admin/compras'); } catch {}
  redirect('/dashboard/admin/compras?message=Compra%20eliminada');
}

export async function createSupplier(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  await ensureSupplierColumns();
  const name = String(formData.get('name') || '');
  const email = String(formData.get('email') || '');
  const phone = String(formData.get('phone') || '');
  const taxId = String(formData.get('taxId') || '');
  const address = String(formData.get('address') || '');
  const rifImageUrl = String(formData.get('rifImageUrl') || '').trim();
  const contactName = String(formData.get('contactName') || '').trim();
  const contactPhone = String(formData.get('contactPhone') || '').trim();
  const chargeCurrencyRaw = String(formData.get('chargeCurrency') || 'USD').toUpperCase();
  const chargeCurrency = chargeCurrencyRaw === 'VES' ? 'VES' : 'USD';
  const givesCreditRaw = formData.get('givesCredit');
  const givesCredit =
    typeof givesCreditRaw === 'string'
      ? givesCreditRaw === 'on' || givesCreditRaw === 'true' || givesCreditRaw === '1'
      : Boolean(givesCreditRaw);
  const creditDaysStr = String(formData.get('creditDays') || '').trim();
  const creditDays =
    creditDaysStr && !isNaN(Number(creditDaysStr)) ? parseInt(creditDaysStr, 10) : null;

  if (!name.trim()) redirect('/dashboard/admin/proveedores?error=Nombre%20requerido');
  await prisma.supplier.create({
    data: {
      name,
      email: email || null,
      phone: phone || null,
      taxId: taxId || null,
      address: address || null,
      rifImageUrl: rifImageUrl || null,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      chargeCurrency: chargeCurrency as any,
      givesCredit,
      creditDays,
    },
  });
  revalidatePath('/dashboard/admin/proveedores');
  redirect('/dashboard/admin/proveedores?message=Proveedor%20creado');
}

export async function updateSupplier(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  await ensureSupplierColumns();
  const id = String(formData.get('id') || '');
  if (!id) { redirect('/dashboard/admin/proveedores?error=ID%20inv%C3%A1lido'); }
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const taxId = String(formData.get('taxId') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const rifImageUrlRaw = formData.get('rifImageUrl');
  const contactName = String(formData.get('contactName') || '').trim();
  const contactPhone = String(formData.get('contactPhone') || '').trim();
  const chargeCurrencyRaw = String(formData.get('chargeCurrency') || 'USD').toUpperCase();
  const chargeCurrency = chargeCurrencyRaw === 'VES' ? 'VES' : 'USD';
  const givesCreditRaw = formData.get('givesCredit');
  const givesCredit =
    typeof givesCreditRaw === 'string'
      ? givesCreditRaw === 'on' || givesCreditRaw === 'true' || givesCreditRaw === '1'
      : Boolean(givesCreditRaw);
  const creditDaysStr = String(formData.get('creditDays') || '').trim();
  const creditDays =
    creditDaysStr && !isNaN(Number(creditDaysStr)) ? parseInt(creditDaysStr, 10) : null;

  if (!name) { redirect('/dashboard/admin/proveedores?error=Nombre%20requerido'); }
  try {
    const data: any = {
      name,
      email: email || null,
      phone: phone || null,
      taxId: taxId || null,
      address: address || null,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      chargeCurrency: chargeCurrency as any,
      givesCredit,
      creditDays,
    };
    if (rifImageUrlRaw !== null) {
      const rif = String(rifImageUrlRaw || '').trim();
      data.rifImageUrl = rif || null;
    }
    await prisma.supplier.update({ where: { id }, data });
  } catch {
    redirect('/dashboard/admin/proveedores?error=No%20se%20pudo%20actualizar');
  }
  revalidatePath('/dashboard/admin/proveedores');
  redirect('/dashboard/admin/proveedores?message=Proveedor%20actualizado');
}

export async function getPOs(filters?: { q?: string; supplierId?: string; from?: string; to?: string; status?: 'DRAFT'|'ORDERED'|'RECEIVED'|'CANCELLED'|string }) {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
    await ensureSupplierColumns();
    const where: any = {};
    if (filters?.q) {
      const q = String(filters.q);
      where.OR = [
        { id: { contains: q } },
        { id: { endsWith: q } },
      ];
    }
    if (filters?.supplierId) {
      where.supplierId = String(filters.supplierId);
    }
    if (filters?.status) {
      const st = String(filters.status).toUpperCase();
      if (['DRAFT','ORDERED','RECEIVED','CANCELLED'].includes(st)) {
        where.status = st as any;
      }
    }
    if (filters?.from || filters?.to) {
      const createdAt: any = {};
      if (filters?.from) {
        const d = new Date(String(filters.from));
        if (!isNaN(d.getTime())) createdAt.gte = d as any;
      }
      if (filters?.to) {
        const d = new Date(String(filters.to));
        if (!isNaN(d.getTime())) {
          const next = new Date(d); next.setDate(next.getDate() + 1);
          createdAt.lt = next as any;
        }
      }
      if (Object.keys(createdAt).length) where.createdAt = createdAt;
    }
    return prisma.purchaseOrder.findMany({ where, include: { supplier: true, items: true, createdBy: true, receivedBy: true }, orderBy: { createdAt: 'desc' } });
  } catch (error) {
    console.error("Error fetching POs:", error);
    return [];
  }
}

export async function createPO(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const supplierId = String(formData.get('supplierId') || '');
  const expectedAt = String(formData.get('expectedAt') || '');
  const itemsJson = String(formData.get('items') || '[]');
  const notes = String(formData.get('notes') || '');
  const purchaseTypeRaw = String(formData.get('purchaseType') || 'CONTADO').toUpperCase();
  const allowedPurchaseTypes = new Set(['CONTADO', 'PARCIAL', 'CREDITO']);
  const purchaseType = allowedPurchaseTypes.has(purchaseTypeRaw) ? (purchaseTypeRaw as any) : 'CONTADO';
  const items: Array<{ productId: string; quantity: number; costUSD: number }> = JSON.parse(itemsJson || '[]');
  if (!supplierId || !items.length) redirect('/dashboard/admin/compras/nueva?error=Proveedor%20e%20items%20requeridos');
  const totalUSD = items.reduce((a, it) => a + Number(it.quantity) * Number(it.costUSD), 0);
  const po = await prisma.purchaseOrder.create({ data: {
    supplierId,
    status: 'ORDERED' as any,
    expectedAt: expectedAt ? (new Date(expectedAt) as any) : null,
    notes: notes || null,
    totalUSD: totalUSD as any,
    purchaseType,
    createdById: (session?.user as any)?.id,
    items: { create: items.map(it => ({ productId: it.productId, quantity: Number(it.quantity), costUSD: Number(it.costUSD) as any })) },
  }});
  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'PO_CREATE', details: po.id } }); } catch {}
  revalidatePath('/dashboard/admin/compras');
  redirect('/dashboard/admin/compras?message=OC%20creada');
}

export async function getPOById(id: string) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  await ensureSupplierColumns();
  return prisma.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, createdBy: true, receivedBy: true, items: { include: { product: true } } } });
}

export async function receivePO(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const poId = String(formData.get('poId') || '').trim();
  try {
    const itemsJson = String(formData.get('items') || '[]');
    const items: Array<{ itemId: string; qty: number }> = JSON.parse(itemsJson || '[]');
    if (!poId || !items.length) redirect(`/dashboard/admin/compras/${poId}?error=Items%20requeridos`);
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
    if (!po) redirect('/dashboard/admin/compras?error=OC%20no%20existe');

    for (const it of items) {
      const dbItem = po.items.find(x => x.id === it.itemId);
      if (!dbItem) continue;
      const receiveQty = Math.max(0, Math.min(Number(it.qty || 0), dbItem.quantity - dbItem.received));
      if (!receiveQty) continue;
      await prisma.purchaseOrderItem.update({ where: { id: dbItem.id }, data: { received: { increment: receiveQty } } });
      await prisma.stockMovement.create({ data: { productId: dbItem.productId, type: 'ENTRADA' as any, quantity: receiveQty, reason: `PO_RECEIPT ${poId}`, userId: (session?.user as any)?.id } });
      const product = await prisma.product.findUnique({ where: { id: dbItem.productId } });
      const oldStock = Number(product?.stock || 0);
      const oldAvg = Number(product?.avgCost || 0);
      const newAvg = (oldStock * oldAvg + receiveQty * Number(dbItem.costUSD)) / Math.max(1, oldStock + receiveQty);
      await prisma.product.update({
        where: { id: dbItem.productId },
        data: {
          stock: { increment: receiveQty },
          stockUnits: { increment: receiveQty } as any,
          lastCost: dbItem.costUSD as any,
          avgCost: newAvg as any,
        },
      });
    }

    const updated = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
    const allReceived = updated?.items.every(x => x.received >= x.quantity);
    if (allReceived) {
      await prisma.purchaseOrder.update({ where: { id: poId }, data: { status: 'RECEIVED' as any, receivedById: (session?.user as any)?.id, receivedAt: new Date() as any } });
      try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'PO_RECEIVE', details: poId } }); } catch {}
    }

    revalidatePath(`/dashboard/admin/compras/${poId}`);
    redirect(`/dashboard/admin/compras/${poId}?message=Recepci%C3%B3n%20registrada`);
  } catch (e) {
    try { revalidatePath(`/dashboard/admin/compras/${poId}`); } catch {}
    redirect(`/dashboard/admin/compras/${poId}?error=No%20se%20pudo%20registrar%20la%20recepci%C3%B3n`);
  }
}
