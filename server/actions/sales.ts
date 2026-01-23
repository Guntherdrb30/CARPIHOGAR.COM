'use server';

import prisma from '@/lib/prisma';
import { normalizeVePhone } from '@/lib/phone';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { basicTemplate, sendMail, isEmailEnabled } from '@/lib/mailer';
import { applyPriceAdjustments, applyUsdPaymentDiscount, getPriceAdjustmentSettings, toCurrencyCode } from '@/server/price-adjustments';

export async function searchProducts(q: string) {
  const where: any = q ? { OR: [ { name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } } ] } : {};
  const items = await prisma.product.findMany({
    where,
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      sku: true,
      priceUSD: true,
      categoryId: true,
      supplier: { select: { chargeCurrency: true } },
    },
  });
  const pricing = await getPriceAdjustmentSettings();
  const toNum = (x: any) => (typeof x?.toNumber === 'function' ? x.toNumber() : Number(x || 0));
  return items.map((p) => ({
    ...p,
    priceUSD: applyPriceAdjustments({
      basePriceUSD: toNum((p as any).priceUSD),
      currency: 'USD',
      supplierCurrency: (p as any).supplier?.chargeCurrency || null,
      categoryId: (p as any).categoryId || null,
      settings: pricing,
    }),
  }));
}

export async function getSellers() {
  const users = await prisma.user.findMany({ where: { role: 'VENDEDOR' }, select: { id: true, name: true, email: true } });
  return users;
}

// Cantidad de ventas con pago por revisar (cualquier origen)
export async function getPendingSalesCount() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') return 0;
  const count = await prisma.order.count({
    where: {
      reviewedAt: null,
      // solo ventas que ya tienen un pago registrado (algo que revisar)
      payment: { isNot: null },
    },
  });
  return count;
}

export async function getSales(params?: { sellerId?: string; invoice?: string; cliente?: string; rif?: string }) {
  const where: any = {};
  if (params?.sellerId) where.sellerId = params.sellerId;
  if (params?.invoice) where.id = { contains: params.invoice } as any;
  if (params?.rif) where.customerTaxId = { contains: params.rif, mode: 'insensitive' } as any;
  if (params?.cliente) {
    where.user = { is: { OR: [
      { name: { contains: params.cliente, mode: 'insensitive' } as any },
      { email: { contains: params.cliente, mode: 'insensitive' } as any },
    ] } } as any;
  }
  const orders = await prisma.order.findMany({
    where,
    include: { user: true, seller: true, payment: true, reviewedBy: true },
    orderBy: { createdAt: 'desc' },
  });
  return orders;
}

export async function markSaleReviewed(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    throw new Error('Not authorized');
  }
  const orderId = String(formData.get('orderId') || '');
  if (!orderId) throw new Error('orderId requerido');
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true, payment: true, shipping: true },
  });
  if (!order) throw new Error('Orden no encontrada');

  const reviewerId = (session?.user as any)?.id || null;
  const status = String(order.status || '').toUpperCase();
  const shouldForcePaid = status === 'PENDIENTE' || status === 'CONFIRMACION';
  const updatedOrder = await prisma.$transaction(async (tx) => {
    const data: any = {
      reviewedAt: new Date() as any,
      reviewedById: reviewerId,
    };
    if (shouldForcePaid) {
      data.status = 'PAGADO' as any;
    }
    const next = await tx.order.update({
      where: { id: order.id },
      data,
      include: { user: true, payment: true, shipping: true },
    });
    if (next.payment && next.payment.status !== 'APROBADO') {
      const refreshedPayment = await tx.payment.update({
        where: { orderId: order.id },
        data: { status: 'APROBADO' as any },
      });
      return { ...next, payment: refreshedPayment } as any;
    }
    return next;
  });

  try {
    await prisma.auditLog.create({
      data: {
        userId: reviewerId,
        action: 'ORDER_REVIEWED',
        details: order.id,
      },
    });
  } catch {}

  // Notificacion por correo al cliente (best-effort)
  try {
    const finalOrder = updatedOrder || order;
    const to = (finalOrder as any).user?.email as string | undefined;
    if (to) {
      const code = finalOrder.id.slice(-6);
      const brand = process.env.BRAND_NAME || 'Carpihogar.ai';
      const base =
        (process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '') ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
        'https://carpihogar.com';
      let docsHtml = '';
      if (base) {
        const reciboUrl = `${base}/api/orders/${finalOrder.id}/pdf?tipo=recibo&moneda=VES`;
        const facturaUrl = `${base}/api/orders/${finalOrder.id}/pdf?tipo=factura&moneda=VES`;
        const pedidosUrl = `${base}/dashboard/cliente/pedidos/${finalOrder.id}`;
        docsHtml = `<p>Adjuntamos tus soportes digitales. Tambien puedes descargarlos cuando quieras:</p>
<ul>
  <li><a href="${reciboUrl}">Recibo en PDF</a></li>
  <li><a href="${facturaUrl}">Factura en PDF</a></li>
</ul>
<p>Puedes ver el estado del pedido y tus documentos desde <a href="${pedidosUrl}">Mis pedidos</a>.</p>`;
      }
      const title = 'Tu pedido fue revisado';
      const bodyHtml = [
        `<p>Hola ${(finalOrder as any).user?.name || 'cliente'},</p>`,
        `<p>Hemos verificado y aprobado tu pago de la orden <strong>${code}</strong>.</p>`,
        `<p>Tu pedido pasara a preparacion y te avisaremos cuando el envio este en camino.</p>`,
        docsHtml,
        `<p>Gracias por comprar en ${brand}.</p>`,
      ]
        .filter(Boolean)
        .join('');
      const html = basicTemplate(title, bodyHtml);
      await sendMail({
        to,
        subject: `${brand} - tu pedido ${code} fue revisado`,
        html,
      });
      try {
        await prisma.auditLog.create({
          data: {
            userId: reviewerId,
            action: 'ORDER_REVIEWED_EMAIL_SENT',
            details: finalOrder.id,
          },
        });
      } catch {}
    }
  } catch {}

  revalidatePath('/dashboard/admin/ventas');
  revalidatePath('/dashboard/admin/envios');
  try {
    revalidatePath('/dashboard/cliente/pedidos');
    revalidatePath('/dashboard/cliente/envios');
    if (order?.id) {
      revalidatePath(`/dashboard/cliente/pedidos/${order.id}`);
      revalidatePath(`/dashboard/cliente/pedidos/${order.id}/print`);
    }
  } catch {}
}

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: { user: true, seller: true, items: { include: { product: true } }, payment: true, shipping: true, shippingAddress: true } });
  return order;
}

export async function getCommissions(params?: { sellerId?: string; status?: 'PENDIENTE' | 'PAGADA' }) {
  const where: any = {};
  if (params?.sellerId) where.sellerId = params.sellerId;
  if (params?.status) where.status = params.status as any;
  const commissions = await prisma.commission.findMany({ where, include: { seller: true, order: true }, orderBy: { createdAt: 'desc' } });
  return commissions;
}

export async function markCommissionPaid(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const id = String(formData.get('commissionId'));
  await prisma.commission.update({ where: { id }, data: { status: 'PAGADA' as any } });
  revalidatePath('/dashboard/admin/ventas');
}

export async function createOfflineSale(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN' && (session?.user as any)?.role !== 'VENDEDOR' && (session?.user as any)?.role !== 'ALIADO') {
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_NOT_AUTHORIZED', details: '' } }); } catch {}
    throw new Error('Not authorized');
  }
  const role = String((session?.user as any)?.role || '');
  const backNewSale = role === 'ALIADO' ? '/dashboard/aliado/ventas/nueva' : '/dashboard/admin/ventas/nueva';
  const userEmailRaw = String(formData.get('customerEmail') || '');
  const userEmail = userEmailRaw.trim().toLowerCase();
  const userName = String(formData.get('customerName') || '').trim();
  const customerPhone = String(formData.get('customerPhone') || '');
  const normalizedPhone = normalizeVePhone(customerPhone || '');
  let customerCreated = false;
  let sellerId = String(formData.get('sellerId') || '');
  const itemsJson = String(formData.get('items') || '[]');
  const items: Array<{ productId: string; name?: string; priceUSD: number; quantity: number } > = JSON.parse(itemsJson || '[]');
  const paymentMethod = String(formData.get('paymentMethod') || 'ZELLE').toUpperCase();
  const paymentCurrency = (String(formData.get('paymentCurrency') || 'USD').toUpperCase());
  const paymentReference = String(formData.get('paymentReference') || '');
  const payerName = String(formData.get('pm_payer_name') || '') || null;
  const payerPhone = String(formData.get('pm_payer_phone') || '') || null;
  const payerBank = String(formData.get('pm_bank') || '') || null;
  const shippingLocalOption = String(formData.get('shippingLocalOption') || '').toUpperCase();
  const saleTypeRaw = String(formData.get('saleType') || 'CONTADO').toUpperCase();
  let saleType: 'CONTADO' | 'CREDITO' = saleTypeRaw === 'CREDITO' ? 'CREDITO' : 'CONTADO';
  const creditDueDateStr = String(formData.get('creditDueDate') || '');
  let creditDueDate: Date | null = creditDueDateStr ? new Date(creditDueDateStr) : null;
  if (role === 'ALIADO') { saleType = 'CONTADO'; creditDueDate = null; }
  const customerTaxId = (String(formData.get('customerTaxId') || '').trim() || null);
  const customerFiscalAddress = (String(formData.get('customerFiscalAddress') || '').trim() || null);
  const originQuoteId = (String(formData.get('originQuoteId') || '').trim() || null);
  const ivaPercentForm = formData.get('ivaPercent');
  const sendEmailFlag = String(formData.get('sendEmail') || '');
  const docTypeRaw = String(formData.get('docType') || 'recibo').toLowerCase();
  const allowedDocs = ['recibo','factura'];
  const docType = (allowedDocs.includes(docTypeRaw) ? docTypeRaw : 'recibo') as 'recibo'|'factura';
  // Shipping address fields
  const incomingShippingAddressId = String(formData.get('shippingAddressId') || '');
  const addrState = String(formData.get('addr_state') || '').trim();
  const addrCity = String(formData.get('addr_city') || '').trim();
  const addrZone = String(formData.get('addr_zone') || '').trim();
  const addr1 = String(formData.get('addr_address1') || '').trim();
  const addr2 = String(formData.get('addr_address2') || '').trim();
  const addrNotes = String(formData.get('addr_notes') || '').trim();
  // If aliado, force sellerId to be current user
  if ((session?.user as any)?.role === 'ALIADO') {
    sellerId = String((session?.user as any)?.id || '');
  }
  // Detecta si el vendedor est�� usando precios especiales (P2/P3) respecto al P1 del producto
  let usesSpecialPrice = false;
  if (role === 'VENDEDOR') {
    try {
      const productIds = Array.from(new Set(items.map((it) => it.productId)));
      if (productIds.length) {
        const products = await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, priceUSD: true, priceAllyUSD: true, priceWholesaleUSD: true },
        });
        const map = new Map(products.map((p) => [p.id, p]));
        for (const it of items) {
          const p = map.get(it.productId);
          if (!p) continue;
          const p1 = Number((p as any).priceUSD);
          const p2 = (p as any).priceAllyUSD != null ? Number((p as any).priceAllyUSD) : null;
          const p3 = (p as any).priceWholesaleUSD != null ? Number((p as any).priceWholesaleUSD) : null;
          const linePrice = Number(it.priceUSD);
          const isP1 = Math.abs(linePrice - p1) < 0.0001;
          const isP2 = p2 != null && Math.abs(linePrice - p2) < 0.0001;
          const isP3 = p3 != null && Math.abs(linePrice - p3) < 0.0001;
          if (!isP1 && (isP2 || isP3)) {
            usesSpecialPrice = true;
            break;
          }
          if (!isP1 && !isP2 && !isP3) {
            usesSpecialPrice = true;
            break;
          }
        }
      }
    } catch {
      usesSpecialPrice = false;
    }
  }

  if (!items.length) {
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_VALIDATION_FAILED', details: 'No hay items' } }); } catch {}
    redirect(`${backNewSale}?error=Debes%20agregar%20al%20menos%20un%20producto`);
  }
  if (!normalizedPhone) {
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_VALIDATION_FAILED', details: 'Telefono requerido' } }); } catch {}
    redirect(`${backNewSale}?error=El%20tel%C3%A9fono%20del%20cliente%20es%20obligatorio%20y%20debe%20ser%20v%C3%A1lido`);
  }
  if (saleType === 'CONTADO' && !['PAGO_MOVIL','TRANSFERENCIA','ZELLE','EFECTIVO'].includes(paymentMethod)) {
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_VALIDATION_FAILED', details: 'Método de pago inválido' } }); } catch {}
    redirect(`${backNewSale}?error=M%C3%A9todo%20de%20pago%20inv%C3%A1lido`);
  }
  if (saleType === 'CONTADO' && paymentMethod !== 'EFECTIVO' && !paymentReference.trim()) {
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_VALIDATION_FAILED', details: 'Referencia requerida' } }); } catch {}
    redirect(`${backNewSale}?error=La%20referencia%20de%20pago%20es%20obligatoria`);
  }
  if (saleType === 'CONTADO' && paymentMethod === 'PAGO_MOVIL' && (!payerName || !payerPhone || !payerBank)) {
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_VALIDATION_FAILED', details: 'Pago movil faltan datos titular/telefono/banco' } }); } catch {}
    redirect(`${backNewSale}?error=Para%20Pago%20M%C3%B3vil%20completa%20titular%2C%20tel%C3%A9fono%20y%20banco`);
  }
  if (!customerTaxId || !customerFiscalAddress) {
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_VALIDATION_FAILED', details: 'Faltan datos fiscales (RIF/Dirección)' } }); } catch {}
    redirect(`${backNewSale}?error=C%C3%A9dula%2FRIF%20y%20direcci%C3%B3n%20fiscal%20son%20obligatorias`);
  }

  // Ensure customer exists or create a placeholder (cliente para ERP + tienda online)
  let user: any = null;
  // 1) Buscar por email si viene informado
  if (userEmail) {
    user = await prisma.user.findUnique({ where: { email: userEmail } });
  }
  // 2) Si no existe por email, intentar por Cédula/RIF a partir de ventas previas
  if (!user && customerTaxId) {
    try {
      const previousOrder = await prisma.order.findFirst({
        where: { customerTaxId: customerTaxId as any },
        select: { userId: true },
      });
      if (previousOrder?.userId) {
        user = await prisma.user.findUnique({ where: { id: previousOrder.userId } });
      }
    } catch {}
  }
  // 3) Como último intento, buscar por teléfono exacto
  const customerPhoneTrimmed = customerPhone.trim();
  if (!user && customerPhoneTrimmed) {
    try {
      user = await prisma.user.findFirst({ where: { phone: customerPhoneTrimmed } });
    } catch {}
  }
  // 4) Crear el cliente si no existe en BD
  if (!user) {
    const emailForNewUser = userEmail || `walkin_${Date.now()}@local`;
    user = await prisma.user.create({
      data: {
        email: emailForNewUser,
        password: '',
        name: userName || 'Cliente Tienda',
        role: 'CLIENTE',
        alliedStatus: 'NONE',
      },
    });
    customerCreated = true;
    try {
      await prisma.auditLog.create({
        data: {
          userId: (session?.user as any)?.id,
          action: 'OFFLINE_SALE_CUSTOMER_CREATED',
          details: `email:${emailForNewUser};phone:${customerPhoneTrimmed};tax:${customerTaxId || ''}`,
        },
      });
    } catch {}
  } else {
    // Cliente ya existe, registrar evento para trazabilidad
    try {
      await prisma.auditLog.create({
        data: {
          userId: (session?.user as any)?.id,
          action: 'OFFLINE_SALE_CUSTOMER_REUSED',
          details: `userId:${user.id};email:${user.email};phone:${customerPhoneTrimmed};tax:${customerTaxId || ''}`,
        },
      });
    } catch {}
  }
  // 5) Actualizar datos básicos del cliente si vienen en esta venta
  try {
    const updates: any = {};
    if (userName && !user.name) updates.name = userName;
    if (customerPhoneTrimmed && customerPhoneTrimmed !== String(user.phone || '')) {
      updates.phone = customerPhoneTrimmed;
    }
    if (Object.keys(updates).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: updates });
    }
  } catch {}

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const ivaPercent = ivaPercentForm !== null ? Number(ivaPercentForm) : Number(settings?.ivaPercent || 16);
  const tasaVES = Number(settings?.tasaVES || 40);
  const effectiveIvaPercent = docType === 'factura' ? ivaPercent : 0;
  const vesSalesDisabled = Boolean((settings as any)?.vesSalesDisabled ?? false);
  if (vesSalesDisabled && String(paymentCurrency) === 'VES') {
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_VALIDATION_FAILED', details: 'VES sales disabled' } }); } catch {}
    redirect(`${backNewSale}?error=${encodeURIComponent('Las ventas en bolívares están desactivadas.')}`);
  }
  // Enforce credit sales: only ADMIN by default; VENDEDOR requires deleteSecret approval
  const deleteSecretInput = String(formData.get('deleteSecret') || '');
  if (role === 'VENDEDOR' && saleType === 'CREDITO') {
    const configuredSecret = String(settings?.deleteSecret || '');
    if (!configuredSecret) {
      try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_CREDIT_DENIED', details: 'No deleteSecret configured' } }); } catch {}
      redirect(`${backNewSale}?error=${encodeURIComponent('Clave de eliminación no configurada. Contacta al admin.')}`);
    }
    if (deleteSecretInput !== configuredSecret) {
      try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_CREDIT_DENIED', details: 'Clave inválida' } }); } catch {}
      redirect(`${backNewSale}?error=${encodeURIComponent('Clave de eliminación inválida para venta a crédito')}`);
    }
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'OFFLINE_SALE_CREDIT_APPROVED', details: 'Vendor credit authorized via deleteSecret' } }); } catch {}
  }
  // Si un VENDEDOR usa precios especiales (P2/P3), tambi��n requiere la clave de supervisor
  if (role === 'VENDEDOR' && usesSpecialPrice) {
    const configuredSecret = String(settings?.deleteSecret || '');
    if (saleType !== 'CREDITO') {
      if (!configuredSecret) {
        try {
          await prisma.auditLog.create({
            data: {
              userId: (session?.user as any)?.id,
              action: 'OFFLINE_SALE_PRICE_OVERRIDE_DENIED',
              details: 'No deleteSecret configured',
            },
          });
        } catch {}
        redirect(
          `${backNewSale}?error=${encodeURIComponent(
            'Clave de supervisor no configurada para usar precios P2/P3. Contacta al admin.'
          )}`
        );
      }
      if (deleteSecretInput !== configuredSecret) {
        try {
          await prisma.auditLog.create({
            data: {
              userId: (session?.user as any)?.id,
              action: 'OFFLINE_SALE_PRICE_OVERRIDE_DENIED',
              details: 'Clave inv��lida',
            },
          });
        } catch {}
        redirect(
          `${backNewSale}?error=${encodeURIComponent(
            'Clave de supervisor inv��lida para usar precios P2/P3'
          )}`
        );
      }
    }
    try {
      await prisma.auditLog.create({
        data: {
          userId: (session?.user as any)?.id,
          action: 'OFFLINE_SALE_PRICE_OVERRIDE_APPROVED',
          details: `Items:${items.length}`,
        },
      });
    } catch {}
  }
  let commissionPercent = Number((settings as any)?.sellerCommissionPercent || 5);
  let sellerRole: string | null = null;
  if (sellerId) {
    const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: { commissionPercent: true, role: true } });
    sellerRole = (seller as any)?.role || null;
    if (seller?.commissionPercent !== null && seller?.commissionPercent !== undefined) {
      commissionPercent = Number(seller.commissionPercent as any);
    }
  }

  // Resolve/create shipping address
  let finalShippingAddressId: string | null = null;
  try {
    if (incomingShippingAddressId) {
      const addr = await prisma.address.findFirst({ where: { id: incomingShippingAddressId, userId: user.id } });
      if (addr) finalShippingAddressId = addr.id;
    }
    if (!finalShippingAddressId && addrState && addrCity && addr1) {
      const created = await prisma.address.create({ data: { userId: user.id, fullname: user.name || userEmail || 'Cliente', phone: normalizedPhone || (user.phone || ''), state: addrState, city: addrCity, zone: (addrZone || null) as any, address1: addr1, address2: (addr2 || null) as any, notes: (addrNotes || null) as any } });
      finalShippingAddressId = created.id;
    }
  } catch {}

  
  let _subtotalUSD = items.reduce((sum, it) => sum + (Number(it.priceUSD) * Number(it.quantity)), 0);
  // Delivery local (Barinas) fee if selected
  if (shippingLocalOption === 'DELIVERY') { _subtotalUSD += 6; }
  const subtotalUSD = _subtotalUSD;
  const pricing = await getPriceAdjustmentSettings();
  let discountableSubtotalUSD = 0;
  try {
    const productIds = Array.from(new Set(items.map((it) => it.productId)));
    if (productIds.length) {
      const productSuppliers = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, supplier: { select: { chargeCurrency: true } } },
      });
      const supplierMap = new Map(productSuppliers.map((p) => [p.id, p] as const));
      discountableSubtotalUSD = items.reduce((sum, it) => {
        const supplierCurrency = (supplierMap.get(it.productId) as any)?.supplier?.chargeCurrency || null;
        if (!supplierCurrency) return sum;
        return toCurrencyCode(supplierCurrency) === 'USD'
          ? sum + (Number(it.priceUSD) * Number(it.quantity))
          : sum;
      }, 0);
    }
  } catch {}
  const discount = applyUsdPaymentDiscount({
    subtotalUSD,
    currency: paymentCurrency,
    settings: pricing,
    eligibleSubtotalUSD: discountableSubtotalUSD,
  });
  const taxableBaseUSD = discount.subtotalAfterDiscount;
  const totalUSD = taxableBaseUSD * (1 + effectiveIvaPercent/100);
  const totalVES = totalUSD * tasaVES;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: ({
        userId: user.id,
        sellerId: sellerId || null,
        originChannel: 'ERP' as any,
        subtotalUSD,
        ivaPercent: effectiveIvaPercent,
        tasaVES,
        totalUSD,
        totalVES,
        status: ((role === 'ALIADO') ? ('CONFIRMACION' as any) : (saleType === 'CONTADO' ? ('PAGADO' as any) : ('PENDIENTE' as any))) as any,
        saleType: saleType as any,
        creditDueDate: creditDueDate as any,
        customerTaxId: customerTaxId as any,
        customerFiscalAddress: customerFiscalAddress as any,
        originQuoteId: originQuoteId as any,
        documentType: (docType === 'factura' ? 'FACTURA' : 'RECIBO') as any,
        shippingAddressId: finalShippingAddressId || null,
        items: {
          create: items.map((it) => ({ productId: it.productId, name: it.name || '', priceUSD: it.priceUSD as any, quantity: it.quantity }))
        }
      } as any),
      include: { items: true }
    });

    // Descontar inventario y registrar movimiento de stock por cada ítem
    for (const it of items) {
      const qty = Number(it.quantity || 0);
      if (!it.productId || !qty) continue;
      await tx.stockMovement.create({
        data: {
          productId: it.productId,
          type: 'SALIDA' as any,
          quantity: qty,
          reason: `VENTA_TIENDA ${created.id}`,
          userId: (session?.user as any)?.id || null,
        },
      });
      await tx.product.update({
        where: { id: it.productId },
        data: {
          stock: { decrement: qty },
          stockUnits: { decrement: qty } as any,
        },
      });
    }

    return created;
  });

  // record payment as approved (solo si es contado)
  const validMethods = ['PAGO_MOVIL','TRANSFERENCIA','ZELLE','EFECTIVO'];
  const method = validMethods.includes(paymentMethod) ? (paymentMethod as any) : ('ZELLE' as any);
  const currency = paymentCurrency === 'VES' ? ('VES' as any) : ('USD' as any);
  if (saleType === 'CONTADO') {
    { const payStatus: any = (role === 'ALIADO') ? ('EN_REVISION' as any) : ('APROBADO' as any); await prisma.payment.create({ data: { orderId: order.id, method, reference: paymentReference || null, status: payStatus, currency, payerName, payerPhone, payerBank } }); }
  }
  if (saleType === 'CREDITO') {
    try {
      await prisma.receivable.create({ data: { orderId: order.id, status: 'PENDIENTE' as any, dueDate: creditDueDate as any } });
    } catch {}
  }
  // Create shipping record for in-store (tienda) order
  try {
    // try to detect city from user's last address
    const addr = await prisma.address.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    const isBarinas = !!addr && /barinas/i.test(String(addr?.city || ''));
    let carrier: any = isBarinas ? ('RETIRO_TIENDA' as any) : ('FLETE_PRIVADO' as any);
    if (shippingLocalOption === 'RETIRO_TIENDA') carrier = 'RETIRO_TIENDA' as any;
    if (shippingLocalOption === 'DELIVERY') carrier = 'DELIVERY' as any;
    const observations = (isBarinas || shippingLocalOption) ? 'Cliente en Barinas: retiro en tienda o delivery incluido' : '';
    await prisma.shipping.create({ data: { orderId: order.id, carrier, tracking: '', status: 'PENDIENTE' as any, channel: 'TIENDA' as any, observations } });
  } catch {}
  // send receipt email to customer if email present and prepare success message
  let successMessage = saleType === 'CREDITO' ? 'Venta a crédito creada' : 'Venta creada';
  // Also send WhatsApp receipt summary if phone provided and messaging configured
  try {
    if (normalizedPhone) {
      const { sendWhatsAppText } = await import('@/lib/whatsapp');
      const brand = (await prisma.siteSettings.findUnique({ where: { id: 1 } }))?.brandName || 'Carpihogar';
      const totalTxt = paymentCurrency === 'VES' ? `Bs ${Number(totalVES).toFixed(2)}` : `$${Number(totalUSD).toFixed(2)}`;
      const code = order.id.slice(-6);
      const body = `Hola ${user.name || 'cliente'}!
Tu ${docType} ${code} ha sido generado.
Total: ${totalTxt}.
¡Gracias por tu compra en ${brand}!`;
      const res = await sendWhatsAppText(normalizedPhone, body);
      try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'WHATSAPP_RECEIPT_SENT', details: `${order.id}:${customerPhone}:${res.ok ? 'OK' : ('ERR ' + (res.error || ''))}` } }); } catch {}
      if (res.ok) successMessage += ' - WhatsApp enviado';
    }
  } catch {}
  if (isEmailEnabled()) {
    try {
      const { sendReceiptEmail } = await import('./email');
      const shouldSend = sendEmailFlag === 'true' || sendEmailFlag === 'on' || sendEmailFlag === '1';
      if (shouldSend && user.email) {
        const res: any = await sendReceiptEmail(order.id, user.email, docType, currency as any);
        if (res?.ok) {
          successMessage = `Venta creada - ${docType} enviada a ${user.email}`;
        } else {
          successMessage = 'Venta creada - No se pudo enviar el email';
        }
      }
    } catch {
      successMessage = 'Venta creada - No se pudo enviar el email';
    }
  }

  if (sellerId && sellerRole === 'VENDEDOR') {
    const amountUSD = Number((totalUSD * commissionPercent) / 100);
    await prisma.commission.create({ data: { orderId: order.id, sellerId, percent: commissionPercent as any, amountUSD: amountUSD as any } });
  }

  const finalMessage = customerCreated ? `${successMessage} - Cliente creado para tienda online` : successMessage;

  try { revalidatePath('/dashboard/admin/ventas'); } catch {}
  try { revalidatePath('/dashboard/aliado/ventas'); } catch {}
  const backTo = role === 'ALIADO' ? '/dashboard/aliado/ventas' : '/dashboard/admin/ventas';
  redirect(`${backTo}?message=${encodeURIComponent(finalMessage)}&orderId=${encodeURIComponent(order.id)}&docType=${encodeURIComponent(docType)}`);
}

export async function sendOrderWhatsAppByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || '');
  if (!['ADMIN','VENDEDOR','ALIADO'].includes(role)) throw new Error('Not authorized');
  const orderId = String(formData.get('orderId') || '');
  const backToDefault = role === 'ALIADO' ? '/dashboard/aliado/ventas' : '/dashboard/admin/ventas';
  const backTo = String(formData.get('backTo') || '') || backToDefault;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
  if (!order) redirect(`${backTo}?message=${encodeURIComponent('Orden no encontrada')}`);
  if (role === 'ALIADO') {
    const myId = String((session?.user as any)?.id || '');
    if (String(order.sellerId || '') !== myId) throw new Error('Not authorized');
  }
  const phone = String((order.user as any)?.phone || '') || '';
  if (!phone) redirect(`${backTo}?message=${encodeURIComponent('El cliente no tiene teléfono registrado')}`);
  let msg = 'WhatsApp enviado';
  try {
    const { sendWhatsAppText } = await import('@/lib/whatsapp');
    const brand = (await prisma.siteSettings.findUnique({ where: { id: 1 } }))?.brandName || 'Carpihogar';
    const totalTxt = `$${Number(order.totalUSD).toFixed(2)}`;
    const code = order.id.slice(-6);
    const storedDocType = String((order as any).documentType || '').toUpperCase();
    const docLabel = storedDocType === 'FACTURA' ? 'factura' : storedDocType === 'RECIBO' ? 'recibo' : 'recibo';
    const body = `Hola ${order.user?.name || 'cliente'}!
Tu ${docLabel} ${code} ha sido generado.
Total: ${totalTxt}.
Gracias por tu compra en ${brand}!`;
    const res = await sendWhatsAppText(phone, body);
    if (!res.ok) msg = 'No se pudo enviar por WhatsApp';
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'WHATSAPP_RECEIPT_SENT_MANUAL', details: `${order.id}:${phone}:${res.ok ? 'OK' : ('ERR ' + (res.error || ''))}` } }); } catch {}
  } catch {
    msg = 'No se pudo enviar por WhatsApp';
  }
  redirect(`${backTo}?message=${encodeURIComponent(msg)}&orderId=${encodeURIComponent(orderId)}`);
}

export async function sendOrderWhatsAppPdfByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || '');
  if (!['ADMIN','VENDEDOR','ALIADO'].includes(role)) throw new Error('Not authorized');
  const orderId = String(formData.get('orderId') || '');
  const tipo = String(formData.get('tipo') || 'factura').toLowerCase();
  const moneda = String(formData.get('moneda') || 'USD').toUpperCase();
  const backToDefault = role === 'ALIADO' ? '/dashboard/aliado/ventas' : '/dashboard/admin/ventas';
  const backTo = String(formData.get('backTo') || '') || backToDefault;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
  if (!order) redirect(`${backTo}?message=${encodeURIComponent('Orden no encontrada')}`);
  if (role === 'ALIADO') {
    const myId = String((session?.user as any)?.id || '');
    if (String(order!.sellerId || '') !== myId) throw new Error('Not authorized');
  }
  const phone = String((order!.user as any)?.phone || '') || '';
  if (!phone) redirect(`${backTo}?message=${encodeURIComponent('El cliente no tiene teléfono registrado')}`);
  const code = order!.id.slice(-6);
  const pdf = `${process.env.NEXT_PUBLIC_URL || ''}/api/orders/${order!.id}/pdf?tipo=${encodeURIComponent(tipo)}&moneda=${encodeURIComponent(moneda)}`;
  let msg = 'PDF enviado por WhatsApp';
  try {
    const { sendWhatsAppDocument } = await import('@/lib/whatsapp');
    const caption = `Tu ${tipo} #${code}`;
    const filename = `${tipo}_${order!.id}.pdf`;
    const res = await sendWhatsAppDocument(phone, pdf, filename, caption);
    if (!res.ok) msg = 'No se pudo enviar PDF por WhatsApp';
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'WHATSAPP_PDF_SENT', details: `${order!.id}:${phone}:${res.ok ? 'OK' : ('ERR ' + (res.error || ''))}` } }); } catch {}
  } catch {
    msg = 'No se pudo enviar PDF por WhatsApp';
  }
  redirect(`${backTo}?message=${encodeURIComponent(msg)}&orderId=${encodeURIComponent(order!.id)}`);
}

export async function approveAllySaleByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const orderId = String(formData.get('orderId') || '');
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
  if (!order) throw new Error('Order not found');
  if (order.payment) {
    await prisma.payment.update({ where: { orderId: order.id }, data: { status: 'APROBADO' as any } });
  }
  const nextStatus: any = (order.saleType as any) === 'CREDITO' ? ('PENDIENTE' as any) : ('PAGADO' as any);
  await prisma.order.update({ where: { id: order.id }, data: { status: nextStatus } });
  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'ALLY_SALE_APPROVED', details: order.id } }); } catch {}
  try { revalidatePath('/dashboard/admin/ventas/aliados'); } catch {}
  try { revalidatePath('/dashboard/admin/ventas'); } catch {}
  try { revalidatePath('/dashboard/aliado/ventas'); } catch {}
  redirect('/dashboard/admin/ventas/aliados?message=' + encodeURIComponent('Venta aprobada'));
}

export async function rejectAllySaleByForm(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
  const orderId = String(formData.get('orderId') || '');
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
  if (!order) throw new Error('Order not found');
  if (order.payment) {
    await prisma.payment.update({ where: { orderId: order.id }, data: { status: 'RECHAZADO' as any } });
  }
  await prisma.order.update({ where: { id: order.id }, data: { status: 'PENDIENTE' as any } });
  try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'ALLY_SALE_REJECTED', details: order.id } }); } catch {}
  try { revalidatePath('/dashboard/admin/ventas/aliados'); } catch {}
  try { revalidatePath('/dashboard/admin/ventas'); } catch {}
  try { revalidatePath('/dashboard/aliado/ventas'); } catch {}
  redirect('/dashboard/admin/ventas/aliados?message=' + encodeURIComponent('Venta rechazada'));
}






