import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ensureSupplierColumns } from '@/server/actions/procurement';

type SaveItem = {
  productId?: string | null;
  code?: string | null;
  name: string;
  quantity: number;
  costUSD: number;
  marginClientPct: number;
  marginAllyPct: number;
  marginWholesalePct: number;
  // Datos adicionales del producto (opcionales)
  supplierCode?: string | null;
  description?: string | null;
  weightKg?: number | null;
  soldBy?: 'UNIT' | 'PACKAGE' | 'BOTH' | null;
  unitsPerPackage?: number | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'REVIEW' | 'WHOLESALE_ONLY' | 'CLEARANCE';
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session || ((session.user as any)?.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureSupplierColumns();
    const schema = z.object({
      supplierId: z.string().optional().nullable(),
      currency: z.enum(['USD', 'VES', 'USDT']).default('USD'),
      tasaVES: z.coerce.number().default(0),
      notes: z.string().optional(),
      invoiceNumber: z.string().optional().nullable(),
      invoiceDate: z.string().optional().nullable(),
      invoiceImageUrl: z.string().optional().nullable(),
      baseAmountUSD: z.coerce.number().optional(),
      discountPercent: z.coerce.number().optional(),
      discountAmountUSD: z.coerce.number().optional(),
      ivaPercent: z.coerce.number().optional(),
      ivaAmountUSD: z.coerce.number().optional(),
      totalInvoiceUSD: z.coerce.number().optional(),
      itemsCount: z.coerce.number().optional(),
      paymentCurrency: z.enum(['USD', 'VES', 'USDT']).optional(),
      bankAccountId: z.string().optional().nullable(),
      paymentReference: z.string().optional().nullable(),
      // IGTF (opcional, para pagos en divisas)
      igtfPercent: z.coerce.number().optional(),
      igtfAmountUSD: z.coerce.number().optional(),
      // Modo de pago / cr�dito
      paymentMode: z.enum(['CONTADO', 'CREDITO_SIN_ABONO', 'CREDITO_CON_ABONO']).optional(),
      paidAmountUSD: z.coerce.number().optional(),
      items: z.array(
        z.object({
          productId: z.string().optional().nullable(),
          code: z.string().optional().nullable(),
          name: z.string().min(1),
          quantity: z.coerce.number().min(0.0001),
          costUSD: z.coerce.number().min(0),
          marginClientPct: z.coerce.number().min(0),
          marginAllyPct: z.coerce.number().min(0),
          marginWholesalePct: z.coerce.number().min(0),
          supplierCode: z.string().optional().nullable(),
          description: z.string().optional().nullable(),
          weightKg: z.coerce.number().optional().nullable(),
          soldBy: z.enum(['UNIT', 'PACKAGE', 'BOTH']).optional().nullable(),
          unitsPerPackage: z.coerce.number().optional().nullable(),
          status: z
            .enum(['ACTIVE', 'INACTIVE', 'REVIEW', 'WHOLESALE_ONLY', 'CLEARANCE'])
            .optional()
            .nullable(),
        }),
      ).min(1),
    });

    const body = schema.parse(await req.json());

    const supplierId: string | undefined = (body?.supplierId || undefined) as any;
    const currency: 'USD' | 'VES' | 'USDT' = body.currency;
    const tasaVES: number = Number(body?.tasaVES || 0) || 0;
    const notes: string | undefined = body?.notes || undefined;
    const invoiceNumber: string | undefined = body?.invoiceNumber || undefined;

    const invoiceDateRaw: string | undefined = body?.invoiceDate || undefined;
    let invoiceDate: Date | null = null;
    if (invoiceDateRaw) {
      const d = new Date(invoiceDateRaw);
      if (!isNaN(d.getTime())) invoiceDate = d;
    }

    const invoiceImageUrl: string | undefined = body?.invoiceImageUrl || undefined;
    const itemsCount: number | undefined = body?.itemsCount || undefined;
    const paymentCurrency: 'USD' | 'VES' | 'USDT' | undefined = body?.paymentCurrency || undefined;
    const bankAccountId: string | undefined = (body?.bankAccountId || undefined) as any;
    const paymentReference: string | undefined = body?.paymentReference || undefined;
    const paymentMode: 'CONTADO' | 'CREDITO_SIN_ABONO' | 'CREDITO_CON_ABONO' | undefined =
      (body as any)?.paymentMode || undefined;

    const items: SaveItem[] = body.items as any;

    let subtotalUSD = 0;
    for (const it of items) subtotalUSD += Number(it.quantity) * Number(it.costUSD);

    const baseAmountUSD =
      typeof body.baseAmountUSD === 'number' && !isNaN(body.baseAmountUSD)
        ? body.baseAmountUSD
        : subtotalUSD;

    const discountPercent =
      typeof body.discountPercent === 'number' && !isNaN(body.discountPercent)
        ? body.discountPercent
        : 0;

    const discountAmountUSD =
      typeof body.discountAmountUSD === 'number' && !isNaN(body.discountAmountUSD)
        ? body.discountAmountUSD
        : Number((baseAmountUSD * (discountPercent / 100)).toFixed(2));

    const ivaPercent =
      typeof body.ivaPercent === 'number' && !isNaN(body.ivaPercent)
        ? body.ivaPercent
        : 0;

    const ivaBase = baseAmountUSD - discountAmountUSD;

    const ivaAmountUSD =
      typeof body.ivaAmountUSD === 'number' && !isNaN(body.ivaAmountUSD)
        ? body.ivaAmountUSD
        : Number((ivaBase * (ivaPercent / 100)).toFixed(2));

    const totalInvoiceUSDBase =
      typeof body.totalInvoiceUSD === 'number' && !isNaN(body.totalInvoiceUSD)
        ? body.totalInvoiceUSD
        : Number((ivaBase + ivaAmountUSD).toFixed(2));

    // IGTF (se registra aparte, no se suma al total de la factura del proveedor)
    let igtfPercent =
      typeof body.igtfPercent === 'number' && !isNaN(body.igtfPercent)
        ? body.igtfPercent
        : 0;

    let paidAmountUSD: number | undefined =
      typeof body.paidAmountUSD === 'number' && !isNaN(body.paidAmountUSD)
        ? body.paidAmountUSD
        : undefined;

    if (paidAmountUSD != null) {
      paidAmountUSD = Math.max(0, Math.min(totalInvoiceUSDBase, paidAmountUSD));
    }

    if (!igtfPercent && paymentCurrency === 'USD' && paidAmountUSD && paidAmountUSD > 0) {
      // Por defecto 3% cuando hay pago en USD, si no se indic�
      igtfPercent = 3;
    }

    const igtfAmountUSD =
      typeof body.igtfAmountUSD === 'number' && !isNaN(body.igtfAmountUSD)
        ? body.igtfAmountUSD
        : (igtfPercent && paidAmountUSD
            ? Number((paidAmountUSD * (igtfPercent / 100)).toFixed(2))
            : 0);

    const totalInvoiceUSD = totalInvoiceUSDBase;

    // Crear cabecera de compra
    const purchase = await prisma.purchase.create({
      data: {
        supplierId: supplierId || null,
        currency: currency as any,
        tasaVES: (tasaVES || 0) as any,
        subtotalUSD: subtotalUSD as any,
        totalUSD: totalInvoiceUSD as any,
        invoiceNumber: invoiceNumber || null,
        invoiceDate: invoiceDate as any,
        invoiceImageUrl: invoiceImageUrl || null,
        baseAmountUSD: baseAmountUSD as any,
        discountPercent: discountPercent as any,
        discountAmountUSD: discountAmountUSD as any,
        ivaPercent: ivaPercent as any,
        ivaAmountUSD: ivaAmountUSD as any,
        igtfPercent: igtfPercent ? (igtfPercent as any) : null,
        igtfAmountUSD: igtfAmountUSD ? (igtfAmountUSD as any) : null,
        itemsCount: itemsCount ?? items.length,
        notes: notes || null,
        createdById: (session.user as any)?.id,
      },
    });

    // Actualizar / crear productos e items de compra
    for (const it of items) {
      const priceClientUSD = Number(
        (it.costUSD * (1 + it.marginClientPct / 100)).toFixed(2),
      );
      const priceAllyUSD = Number(
        (it.costUSD * (1 + it.marginAllyPct / 100)).toFixed(2),
      );
      const priceWholesaleUSD = Number(
        (it.costUSD * (1 + it.marginWholesalePct / 100)).toFixed(2),
      );

      if (it.productId) {
        const p = await prisma.product.findUnique({ where: { id: it.productId } });
        if (p) {
          const oldStockUnits = Number(((p as any).stockUnits ?? p.stock ?? 0));
          const oldAvg = Number(p.avgCost || p.costUSD || it.costUSD || 0);
          const newAvg =
            (oldStockUnits * oldAvg + Number(it.quantity) * Number(it.costUSD)) /
            Math.max(1, oldStockUnits + Number(it.quantity));

          await prisma.product.update({
            where: { id: p.id },
            data: {
              lastCost: it.costUSD as any,
              costUSD: it.costUSD as any,
              avgCost: newAvg as any,
              marginClientPct: it.marginClientPct as any,
              marginAllyPct: it.marginAllyPct as any,
              marginWholesalePct: it.marginWholesalePct as any,
              priceClientUSD: priceClientUSD as any,
              priceUSD: priceClientUSD as any,
              priceAllyUSD: priceAllyUSD as any,
              priceWholesaleUSD: priceWholesaleUSD as any,
              // Metadatos opcionales del producto
              supplierCode: (it.supplierCode ?? undefined) as any,
              description: (it.description ?? undefined) as any,
              weightKg: (typeof it.weightKg === 'number' ? it.weightKg : (p as any).weightKg) as any,
              soldBy: (it.soldBy ?? (p as any).soldBy ?? 'UNIT') as any,
              unitsPerPackage: (typeof it.unitsPerPackage === 'number'
                ? it.unitsPerPackage
                : (p as any).unitsPerPackage) as any,
              status: (it as any).status ? ((it as any).status as any) : (p as any).status,
              stock: { increment: Number(it.quantity) },
              stockUnits: { increment: Number(it.quantity) } as any,
            },
          });
        }
      } else {
        const created = await prisma.product.create({
          data: {
            name: it.name,
            slug: `${Date.now().toString(36)}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            brand: 'Sin marca',
            images: [],
            sku: it.code || null,
            code: it.code || null,
            supplierCode: (it.supplierCode ?? null) as any,
            description: (it.description ?? null) as any,
            stock: Number(it.quantity),
            stockUnits: Number(it.quantity) as any,
            supplierId: supplierId || null,
            costUSD: it.costUSD as any,
            lastCost: it.costUSD as any,
            avgCost: it.costUSD as any,
            marginClientPct: it.marginClientPct as any,
            marginAllyPct: it.marginAllyPct as any,
            marginWholesalePct: it.marginWholesalePct as any,
            priceClientUSD: priceClientUSD as any,
            priceUSD: priceClientUSD as any,
            priceAllyUSD: priceAllyUSD as any,
            priceWholesaleUSD: priceWholesaleUSD as any,
            weightKg: (typeof it.weightKg === 'number' ? it.weightKg : null) as any,
            soldBy: (it.soldBy ?? 'UNIT') as any,
            unitsPerPackage: (typeof it.unitsPerPackage === 'number'
              ? it.unitsPerPackage
              : null) as any,
            status: ((it as any)?.status as any) || ('ACTIVE' as any),
          },
          select: { id: true },
        });
        it.productId = created.id;
      }

      const subtotal = Number(it.quantity) * Number(it.costUSD);
      await prisma.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productId: String(it.productId),
          name: it.name,
          quantity: Number(it.quantity),
          costUSD: Number(it.costUSD) as any,
          subtotalUSD: subtotal as any,
        },
      });

      await prisma.stockMovement.create({
        data: {
          productId: String(it.productId),
          type: 'ENTRADA' as any,
          quantity: Number(it.quantity),
          reason: `PURCHASE ${purchase.id}`,
          userId: (session.user as any)?.id,
        },
      });
    }

    // Determinar monto efectivamente pagado (para banco y abono)
    let effectivePaidUSD: number = 0;
    if (paymentMode === 'CONTADO') {
      effectivePaidUSD = paidAmountUSD != null ? paidAmountUSD : totalInvoiceUSD;
    } else if (paymentMode === 'CREDITO_CON_ABONO') {
      effectivePaidUSD = paidAmountUSD != null ? paidAmountUSD : 0;
    } else if (!paymentMode) {
      // Compatibilidad hacia atr�s: mismo comportamiento previo
      if (bankAccountId && paymentCurrency && totalInvoiceUSD > 0) {
        effectivePaidUSD = totalInvoiceUSD;
      }
    }
    if (effectivePaidUSD < 0.0001) effectivePaidUSD = 0;

    // Registrar movimiento bancario si se indic� cuenta, moneda y hay pago
    if (bankAccountId && paymentCurrency && effectivePaidUSD > 0) {
      try {
        await prisma.bankTransaction.create({
          data: {
            bankAccountId,
            type: 'DEBITO' as any,
            amount: effectivePaidUSD as any,
            currency: paymentCurrency as any,
            description: `Compra a proveedor ${supplierId || ''}`.trim(),
            reference: paymentReference || null,
            purchaseId: purchase.id,
          },
        });
      } catch (e) {
        console.error('[purchases/save] bankTransaction error', e);
      }
    }

    // Crear cuenta por pagar asociada
    try {
      let dueDate: Date | null = null;
      if (supplierId) {
        const sup = await prisma.supplier.findUnique({
          where: { id: supplierId },
          select: { givesCredit: true, creditDays: true },
        });
        if (sup?.givesCredit && sup.creditDays && Number(sup.creditDays) > 0) {
          const base = new Date(purchase.createdAt as any);
          base.setDate(base.getDate() + Number(sup.creditDays));
          dueDate = base;
        }
      }

      let initialStatus: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' = 'PENDIENTE';
      let initialBalance = totalInvoiceUSD;

      if (paymentMode === 'CONTADO') {
        const paid = effectivePaidUSD || totalInvoiceUSD;
        initialBalance = Math.max(0, totalInvoiceUSD - paid);
        initialStatus = initialBalance <= 0.01 ? 'PAGADO' : 'PARCIAL';
      } else if (paymentMode === 'CREDITO_CON_ABONO') {
        const paid = effectivePaidUSD || 0;
        initialBalance = Math.max(0, totalInvoiceUSD - paid);
        if (paid > 0 && initialBalance > 0.01) initialStatus = 'PARCIAL';
        else if (paid > 0 && initialBalance <= 0.01) initialStatus = 'PAGADO';
        else initialStatus = 'PENDIENTE';
      } else if (paymentMode === 'CREDITO_SIN_ABONO') {
        initialStatus = 'PENDIENTE';
        initialBalance = totalInvoiceUSD;
      } else {
        // Compatibilidad hacia atr�s
        if (bankAccountId && paymentCurrency && totalInvoiceUSD > 0) {
          initialStatus = 'PAGADO';
          initialBalance = 0;
        } else {
          initialStatus = 'PENDIENTE';
          initialBalance = totalInvoiceUSD;
        }
      }

      const payable = await prisma.payable.create({
        data: {
          purchaseId: purchase.id,
          supplierId: supplierId || null,
          totalUSD: totalInvoiceUSD as any,
          balanceUSD: initialBalance as any,
          status: initialStatus as any,
          dueDate,
        },
      });

      if (effectivePaidUSD > 0) {
        await prisma.payableEntry.create({
          data: {
            payableId: payable.id,
            amountUSD: effectivePaidUSD as any,
            currency: (paymentCurrency || currency) as any,
            method: null,
            bankAccountId: bankAccountId || null,
            reference: paymentReference || null,
            notes:
              paymentMode === 'CREDITO_CON_ABONO'
                ? 'Abono registrado al crear la compra'
                : 'Pago registrado al crear la compra',
          },
        });
      }
    } catch (e) {
      console.error('[purchases/save] payable create error', e);
    }

    try {
      await prisma.auditLog.create({
        data: {
          userId: (session.user as any)?.id,
          action: 'PURCHASE_SAVE',
          details: purchase.id,
        },
      });
    } catch {}

    revalidatePath('/dashboard/admin/compras');
    return NextResponse.json({ ok: true, id: purchase.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'No se pudo guardar la compra' },
      { status: 500 },
    );
  }
}
