'use server';

import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPayment } from './payments';
import type { Currency } from '@prisma/client';
import { applyPriceAdjustments, applyUsdPaymentDiscount, getPriceAdjustmentSettings, toCurrencyCode } from '@/server/price-adjustments';
import { computeConfigurablePrice } from '@/server/ecpd-pricing';

// Use the shared Prisma client to avoid creating multiple connections

export async function getMyOrders(params?: { take?: number }) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
        // Gracefully handle when session is not yet established on first render
        return [] as any[];
    }

    try {
        const orders = await prisma.order.findMany({
            where: { userId },
            include: {
                items: true,
                payment: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: params?.take,
        });
        return orders;
    } catch (e) {
        console.warn('[getMyOrders] DB error, returning empty list.', e);
        return [] as any[];
    }
}

export async function getAllOrders() {
  // Esta función asume que el caller ya verificó permisos.
  // Si por alguna razón se llama sin sesión válida, devolvemos lista vacía
  // en lugar de lanzar un error que rompa el render del dashboard.
  try {
    const orders = await prisma.order.findMany({
      include: {
        items: true,
        user: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return orders;
  } catch (e) {
    console.error('[getAllOrders] error', e);
    return [] as any[];
  }
}

export async function confirmOrderAction(_prevState: any, formData: FormData) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const emailVerified = (session?.user as any)?.emailVerified === true;
    const role = (session?.user as any)?.role as string | undefined;
    if (!userId) {
        try { await prisma.auditLog.create({ data: { userId: undefined, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Not authenticated' } }); } catch {}
        return { ok: false, error: 'Not authenticated' };
    }
    if (!emailVerified && (role === 'CLIENTE' || role === 'ALIADO' || role === 'DELIVERY')) {
        try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Email not verified' } }); } catch {}
        return { ok: false, error: 'Debes verificar tu correo antes de comprar' };
    }

    try {
        const itemsJson = (formData.get('items') as string) || '[]';
        const items: Array<{ id: string; name: string; priceUSD: number; quantity: number; type?: string; config?: any }> = JSON.parse(itemsJson);

        if (!Array.isArray(items) || items.length === 0) {
            try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Cart is empty' } }); } catch {}
            return { ok: false, error: 'Cart is empty' };
        }

        const method = (formData.get('paymentMethod') as string) as any;
        const paymentCurrency = ((formData.get('paymentCurrency') as string) || 'USD').toUpperCase() as Currency;
        const reference = (formData.get('reference') as string) || undefined;
        const proofUrl = (formData.get('proofUrl') as string) || undefined;
        const pmPhone = (formData.get('pm_phone') as string) || '';
        const pmPayerName = (formData.get('pm_payer_name') as string) || '';
        const pmBank = (formData.get('pm_bank') as string) || '';
        const zelleEmail = (formData.get('zelle_email') as string) || '';
        const zellePayerName = (formData.get('zelle_payer_name') as string) || '';
        const depositBank = (formData.get('deposit_bank') as string) || '';
        const depositPayerName = (formData.get('deposit_payer_name') as string) || '';
        const depositPayerId = (formData.get('deposit_payer_id') as string) || '';
        const transferPayerName = (formData.get('transfer_payer_name') as string) || '';
        const transferPayerId = (formData.get('transfer_payer_id') as string) || '';
        const transferBank = (formData.get('transfer_bank') as string) || '';
        const shippingOption = ((formData.get('shippingOption') as string) || '').toUpperCase();
        const shippingCarrier = ((formData.get('shippingCarrier') as string) || '').toUpperCase();
        const shippingAddressId = (formData.get('shippingAddressId') as string) || '';

        // Validations
        const validMethods = ['PAGO_MOVIL','TRANSFERENCIA','ZELLE'];
        if (!validMethods.includes(String(method))) {
            try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Invalid method' } }); } catch {}
            return { ok: false, error: 'MÃ©todo de pago invÃ¡lido' };
        }
        if (!reference || !reference.trim()) {
            try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Missing reference' } }); } catch {}
            return { ok: false, error: 'La referencia de pago es obligatoria' };
        }
        if (String(method) === 'PAGO_MOVIL' && !pmPhone.trim()) {
            try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Missing pm_phone' } }); } catch {}
            return { ok: false, error: 'Para Pago MÃ³vil, el telÃ©fono es obligatorio' };
        }
        if (String(method) === 'PAGO_MOVIL' && !pmPayerName.trim()) {
            try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Missing pm_payer_name' } }); } catch {}
            return { ok: false, error: 'Para Pago MÃ³vil, el nombre del titular es obligatorio' };
        }
        if (String(method) === 'PAGO_MOVIL' && !pmBank.trim()) {
            try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Missing pm_bank' } }); } catch {}
            return { ok: false, error: 'Para Pago MÃ³vil, el banco del titular es obligatorio' };
        }
        if (String(method) === 'ZELLE') {
            if (!zelleEmail.trim() && !zellePayerName.trim()) {
                try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Missing zelle payer info' } }); } catch {}
                return { ok: false, error: 'Para Zelle, indica el nombre del titular o el correo' };
            }
        }
        if (String(method) === 'TRANSFERENCIA') {
            if (String(paymentCurrency) === 'USD') {
                if (!depositPayerName.trim() || !depositPayerId.trim() || !depositBank.trim()) {
                    try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Missing deposit fields' } }); } catch {}
                    return { ok: false, error: 'Para depósito en USD, nombre, cédula y banco son obligatorios' };
                }
            } else if (String(paymentCurrency) === 'VES') {
                if (!transferPayerName.trim() || !transferPayerId.trim()) {
                    try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Missing transfer VES fields' } }); } catch {}
                    return { ok: false, error: 'Para transferencia en Bs, nombre y cédula son obligatorios' };
                }
            }
        }

        // Extra guard for VES transfer bank selection (if not captured above)
        if (String(method) === 'TRANSFERENCIA' && String(paymentCurrency) === 'VES') {
            if (!transferBank.trim()) {
                try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_VALIDATION_FAILED', details: 'Missing transfer bank (VES)' } }); } catch {}
                return { ok: false, error: 'Para transferencia en Bs, selecciona el banco (Banesco o Mercantil).' };
            }
        }

        const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
        const tasaVES = Number((settings as any)?.tasaVES || 40);
        const ivaPercent = Number((settings as any)?.ivaPercent || 16);

        // Resolve shipping address: selected by user or fallback to latest
        let selectedAddress: any = null;
        if (shippingAddressId) {
            selectedAddress = await prisma.address.findFirst({ where: { id: shippingAddressId, userId } });
        }
        if (!selectedAddress) {
            selectedAddress = await prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
        }
        if (!selectedAddress) {
            try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_VALIDATION_FAILED', details: 'No address on file' } }); } catch {}
            return { ok: false, error: 'Debes agregar una direcciÃ³n de envÃ­o antes de confirmar.' };
        }
        
        // Ensure phone is present and sync to user profile
        try {
            const phoneRaw = String((selectedAddress as any).phone || '').trim();
            const digits = phoneRaw.replace(/[^0-9]/g, '');
            if (!digits || digits.length < 7) {
                try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_VALIDATION_FAILED', details: 'Missing phone in address' } }); } catch {}
                return { ok: false, error: 'Tu teléfono es obligatorio en la dirección de envío.' };
            }
            const current = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
            if (!current?.phone || String(current.phone) !== phoneRaw) {
                await prisma.user.update({ where: { id: userId }, data: { phone: phoneRaw } });
            }
        } catch {}
        const toNumberSafe = (value: any, fallback = 0) => {
            try {
                if (value == null) return fallback;
                if (typeof value === 'number') return isFinite(value) ? value : fallback;
                if (typeof value?.toNumber === 'function') return value.toNumber();
                const n = Number(value);
                return isFinite(n) ? n : fallback;
            } catch {
                return fallback;
            }
        };

        const pricing = await getPriceAdjustmentSettings();
        const currencyCode = toCurrencyCode(paymentCurrency);

        // Validate stock and compute adjusted prices
        const ids = Array.from(new Set(items.map(i => i.id)));
        const products = await prisma.product.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                name: true,
                stock: true,
                stockUnits: true,
                allowBackorder: true,
                priceUSD: true,
                categoryId: true,
                configSchema: true,
                widthCm: true,
                depthCm: true,
                heightCm: true,
                supplier: { select: { chargeCurrency: true } },
            },
        });
        const byId = new Map(products.map(p => [p.id, p] as const));
        const pricedItems = items.map((it) => {
            const p = byId.get(it.id);
            if (!p) {
                throw new Error(`Producto no encontrado (${it.name})`);
            }
            const isConfigurable = (it as any).type === 'configurable' || (it as any).config;
            const base = toNumberSafe((p as any).priceUSD, 0);
            const supplierCurrency = (p as any).supplier?.chargeCurrency || null;
            const priceUSD = isConfigurable
                ? ((it as any).config
                    ? computeConfigurablePrice({
                        config: (it as any).config,
                        product: {
                          name: (p as any).name || '',
                          priceUSD: (p as any).priceUSD,
                          categoryId: (p as any).categoryId || null,
                          configSchema: (p as any).configSchema,
                          widthCm: (p as any).widthCm ?? null,
                          depthCm: (p as any).depthCm ?? null,
                          heightCm: (p as any).heightCm ?? null,
                        },
                        currency: currencyCode,
                        supplierCurrency,
                        settings: pricing,
                      })
                    : Number(it.priceUSD || 0))
                : applyPriceAdjustments({
                    basePriceUSD: base,
                    currency: currencyCode,
                    supplierCurrency,
                    categoryId: (p as any).categoryId || null,
                    settings: pricing,
                });
            return { ...it, priceUSD };
        });
        let subtotalUSD = pricedItems.reduce(
            (sum, it) => sum + Number(it.priceUSD) * Number(it.quantity),
            0,
        );

        const discount = applyUsdPaymentDiscount({ subtotalUSD, currency: paymentCurrency, settings: pricing });
        const taxableBaseUSD = discount.subtotalAfterDiscount;

        const ivaAmount = taxableBaseUSD * (ivaPercent / 100);
        const totalUSD = taxableBaseUSD + ivaAmount;

        const totalVES = totalUSD * tasaVES;
        // Check availability
        for (const it of items) {
            const p = byId.get(it.id);
            if (!p) {
                return { ok: false, error: `Producto no encontrado (${it.name})` };
            }
            const available = (p as any).stockUnits != null ? Number((p as any).stockUnits) : Number(p.stock);
            if (available < Number(it.quantity)) {
                return { ok: false, error: `Stock insuficiente para ${p.name}. Disponible: ${available}` };
            }
        }

        const order = await prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    userId,
                    subtotalUSD,
                    ivaPercent,
                    tasaVES,
                    totalUSD,
                    totalVES,
                    shippingAddressId: selectedAddress.id,
                    items: {
                        create: pricedItems.map((it) => ({
                            productId: it.id,
                            name: it.name,
                            priceUSD: Number(it.priceUSD),
                            quantity: Number(it.quantity),
                        })),
                    },
                },
            });
            // Deduct stock and record movement
            for (const it of items) {
                await tx.stockMovement.create({ data: { productId: it.id, type: 'SALIDA' as any, quantity: Number(it.quantity), reason: `SALE ${order.id}`, userId } });
                await tx.product.update({
                    where: { id: it.id },
                    data: {
                        stock: { decrement: Number(it.quantity) },
                        stockUnits: { decrement: Number(it.quantity) } as any,
                    },
                });
            }
            return order;
        });

        // Map payer info based on method/currency
        let _payerName: string | undefined = undefined;
        let _payerPhone: string | undefined = undefined;
        let _payerBank: string | undefined = undefined;
        let _payerId: string | undefined = undefined;
        if (String(method) === 'PAGO_MOVIL') {
            _payerName = pmPayerName || undefined;
            _payerPhone = pmPhone || undefined;
            _payerBank = pmBank || undefined;
        } else if (String(method) === 'ZELLE') {
            _payerName = zellePayerName || undefined;
        } else if (String(method) === 'TRANSFERENCIA') {
            if (String(paymentCurrency) === 'USD') {
                _payerName = depositPayerName || undefined;
                _payerId = depositPayerId || undefined;
                _payerBank = depositBank || undefined;
            } else {
                _payerName = transferPayerName || undefined;
                _payerId = transferPayerId || undefined;
                _payerBank = transferBank || undefined;
            }
        }
        await createPayment(order.id, method, reference, proofUrl, paymentCurrency, _payerName, _payerPhone, _payerBank, _payerId);

        // Create shipping record for online order with default carrier logic
        try {
            const addr = selectedAddress;
            const isBarinas = !!addr && /barinas/i.test(String(addr.city || ''));
            let channel: any = isBarinas ? ('TIENDA' as any) : ('ONLINE' as any);
            let carrier: any = isBarinas ? ('RETIRO_TIENDA' as any) : ('TEALCA' as any);
            if (shippingOption === 'RETIRO_TIENDA' || shippingOption === 'DELIVERY') {
                channel = 'TIENDA' as any;
                carrier = shippingOption as any;
            } else if (!isBarinas) {
                if (shippingCarrier === 'TEALCA' || shippingCarrier === 'MRW') {
                    carrier = shippingCarrier as any;
                }
            }
            const observations = (channel === 'TIENDA') ? 'Cliente en Barinas: retiro en tienda o delivery incluido' : '';
            await prisma.shipping.create({
                data: {
                    orderId: order.id,
                    carrier,
                    tracking: '',
                    status: 'PENDIENTE' as any,
                    channel,
                    observations,
                },
            });
        } catch {}

        // Enviar recibo por email (deshabilitado por defecto, activar con EMAIL_ENABLED=true)
        if (process.env.EMAIL_ENABLED === 'true') {
            try {
                const { sendReceiptEmail } = await import('./email');
                const to = (session?.user as any)?.email as string | undefined;
                if (to) await sendReceiptEmail(order.id, to, 'recibo', paymentCurrency as any);
            } catch {}
        }

        return { ok: true, orderId: order.id };
    } catch (e) {
        try { await prisma.auditLog.create({ data: { userId, action: 'CHECKOUT_PAYMENT_ERROR', details: String(e) } }); } catch {}
        return { ok: false, error: 'Failed to confirm order' };
    }
}


export async function getMyOrderById(id: string) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
        throw new Error('Not authenticated');
    }
    const order = await prisma.order.findFirst({
        where: { id, userId },
        include: { items: true, payment: true, shipping: true, shippingAddress: true },
    });
    if (!order) throw new Error('Order not found');
    return order as any;
}

export async function getAllShippedOrders(query?: string) {
    const session = await getServerSession(authOptions);

    if (((session?.user as any)?.role) !== 'ADMIN') {
        throw new Error('Not authorized');
    }

    const whereClause: any = {
        shipping: {
            isNot: null
        },
    };

    if (query) {
        whereClause.OR = [
            { shipping: { tracking: { contains: query, mode: 'insensitive' } } },
            { user: { name: { contains: query, mode: 'insensitive' } } },
            { shippingAddress: { city: { contains: query, mode: 'insensitive' } } },
        ];
    }

    const orders = await prisma.order.findMany({
        where: whereClause,
        include: {
            user: true,
            shipping: true,
            shippingAddress: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    return orders;
}

export async function getMyShipments() {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
        throw new Error('Not authenticated');
    }
    try {
        const orders = await prisma.order.findMany({
            where: { userId, shipping: { isNot: null } },
            include: { shipping: true, shippingAddress: true },
            orderBy: { createdAt: 'desc' },
        });
        return orders as any;
    } catch (e) {
        console.warn('[getMyShipments] DB error, returning empty list.', e);
        return [] as any[];
    }
}

export async function markShipmentReceived(orderId: string) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) throw new Error('Not authenticated');

    const order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: { shipping: true } });
    if (!order) throw new Error('Order not found');
    if (!order.shipping) throw new Error('Shipping record not found');

    // Only allow customer to confirm for national shipments (TEALCA/MRW)
    const carrier = String((order.shipping as any)?.carrier || '');
    if (carrier !== 'TEALCA' && carrier !== 'MRW') { throw new Error('Not allowed for this carrier'); }
    // Update shipping and order status
    await prisma.shipping.update({ where: { orderId }, data: { status: 'ENTREGADO' as any } });
    try { await prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETADO' as any } }); } catch {}
    try { await prisma.auditLog.create({ data: { userId, action: 'CUSTOMER_CONFIRMED_DELIVERY', details: `order:${orderId}` } }); } catch {}

    try { const { revalidatePath } = await import('next/cache'); revalidatePath('/dashboard/cliente/envios', 'page' as any); } catch {}
    try { const { revalidatePath } = await import('next/cache'); revalidatePath('/dashboard/cliente/pedidos'); } catch {}
    try { const { revalidatePath } = await import('next/cache'); revalidatePath('/dashboard/admin/envios'); } catch {}
    return { ok: true };
}

export async function submitDeliveryFeedback(formData: FormData) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) throw new Error('Not authenticated');

    const orderId = String(formData.get('orderId') || '').trim();
    const ratingRaw = String(formData.get('rating') || '').trim();
    const tipRaw = String(formData.get('tipUSD') || '').trim();

    if (!orderId) throw new Error('Missing orderId');

    let rating: number | null = null;
    if (ratingRaw) {
        const n = Number(ratingRaw);
        if (Number.isFinite(n) && n >= 1 && n <= 5) {
            rating = Math.round(n);
        }
    }
    let tipUSD: number | null = null;
    if (tipRaw) {
        const t = Number(tipRaw.replace(',', '.'));
        if (Number.isFinite(t) && t >= 0) {
            tipUSD = parseFloat(t.toFixed(2));
        }
    }

    const order = await prisma.order.findFirst({
        where: { id: orderId, userId },
        include: { shipping: true },
    });
    if (!order || !order.shipping) throw new Error('Order not found');

    const carrier = String(order.shipping.carrier || '');
    if (carrier !== 'DELIVERY') throw new Error('Feedback only allowed for envíos con Delivery local');

    await prisma.shipping.update({
        where: { orderId },
        data: {
            clientRating: rating ?? null,
            tipUSD: tipUSD != null ? (tipUSD as any) : order.shipping.tipUSD,
            clientConfirmedAt: new Date() as any,
        },
    });

    try {
        const { revalidatePath } = await import('next/cache');
        revalidatePath('/dashboard/cliente/pedidos');
        revalidatePath('/dashboard/cliente/envios');
        revalidatePath('/dashboard/delivery');
        revalidatePath('/dashboard/delivery/ganancias');
    } catch {}

    return { ok: true };
}











