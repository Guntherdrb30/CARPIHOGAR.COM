"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { ShippingStatus, ShippingCarrier } from "@prisma/client";
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

function toRad(deg: number) {
    return (deg * Math.PI) / 180;
}

// Distancia aproximada en km entre dos puntos (lat/lng) usando Haversine
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371; // radio de la Tierra en km
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
}

type ShippingUpdatePayload = {
    orderId: string;
    carrier: ShippingCarrier;
    tracking: string;
    status: ShippingStatus;
    observations: string;
};

export async function saveShippingDetails(payload: ShippingUpdatePayload) {
    const { orderId, ...data } = payload;

    // AuthZ: ADMIN full control. VENDEDOR (despacho) con restricciones por carrier/estado
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role as string | undefined;
    if (!role) throw new Error('Not authenticated');

    // Carga estado actual para evaluar reglas
    const current = await prisma.shipping.findUnique({ where: { orderId } });
    const targetCarrier = data.carrier || (current?.carrier as any);
    const targetStatus = data.status;

    if (role !== 'ADMIN') {
        if (role === 'DESPACHO') {
            // Reglas de despacho:
            // - RETIRO_TIENDA: se puede marcar ENTREGADO (entregado al cliente en tienda)
            // - TEALCA/MRW: se puede marcar DESPACHADO o EN_TRANSITO (entregado al transportista)
            const allowedForPickup = ['ENTREGADO', 'PREPARANDO', 'DESPACHADO'] as const;
            const allowedForCouriers = ['DESPACHADO', 'EN_TRANSITO'] as const;
            const carrierStr = String(targetCarrier || '').toUpperCase();
            const statusStr = String(targetStatus || '').toUpperCase();
            let ok = false;
            if (carrierStr === 'RETIRO_TIENDA') ok = allowedForPickup.includes(statusStr as any);
            else if (carrierStr === 'TEALCA' || carrierStr === 'MRW') ok = allowedForCouriers.includes(statusStr as any);
            if (!ok) {
                throw new Error('Not authorized for this status/carrier update');
            }
        } else {
            throw new Error('Not authorized');
        }
    }

    const result = await prisma.shipping.upsert({
        where: {
            orderId: orderId,
        },
        create: {
            orderId: orderId,
            carrier: data.carrier,
            tracking: data.tracking || "",
            status: data.status || 'PENDIENTE',
            observations: data.observations || "",
        },
        update: {
            carrier: data.carrier,
            tracking: data.tracking || "",
            status: data.status,
            observations: data.observations || "",
        },
    });

    // Audit log
    try {
        const userId = (session?.user as any)?.id as string | undefined;
        const before = { status: current?.status, carrier: current?.carrier, tracking: current?.tracking } as any;
        const after = { status: result.status, carrier: result.carrier, tracking: result.tracking } as any;
        const details = JSON.stringify({ orderId, before, after });
        await prisma.auditLog.create({ data: { userId, action: 'SHIPPING_UPDATE', details } });
    } catch {}

    // If marked delivered in admin, also close the order
    try {
        if (result.status === 'ENTREGADO') {
            await prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETADO' as any } });
        }
    } catch {}

    revalidatePath('/dashboard/admin/envios');
    try { revalidatePath('/dashboard/admin/envios/online'); } catch {}
    try { revalidatePath('/dashboard/admin/envios/tienda'); } catch {}
    try { revalidatePath('/dashboard/cliente/envios'); } catch {}
    try { revalidatePath('/dashboard/admin/envios/logs'); } catch {}
    
    return { success: true, data: result };
}

export async function updateShippingStatusFromAdmin(formData: FormData) {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role as string | undefined;
    const email = String((session?.user as any)?.email || '').toLowerCase();
    const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
    const isRoot = role === 'ADMIN' && email === rootEmail;
    if (role !== 'DESPACHO' && !isRoot) {
        throw new Error('Not authorized');
    }

    const orderId = String(formData.get('orderId') || '').trim();
    const statusRaw = String(formData.get('status') || '').trim().toUpperCase();
    if (!orderId || !statusRaw) {
        throw new Error('Missing order or status');
    }
    const allowedStatuses = Object.values(ShippingStatus) as ShippingStatus[];
    const normalizedStatus = allowedStatuses.includes(statusRaw as ShippingStatus)
        ? (statusRaw as ShippingStatus)
        : 'PENDIENTE';

    const existing = await prisma.shipping.findUnique({ where: { orderId } });
    if (!existing) {
        throw new Error('Shipping record not found');
    }

    const delta: any = { status: normalizedStatus };
    if (normalizedStatus === 'ENTREGADO') {
        delta.deliveryConfirmedAt = new Date() as any;
    }

    const result = await prisma.shipping.update({
        where: { orderId },
        data: delta,
    });

    if (normalizedStatus === 'ENTREGADO') {
        try { await prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETADO' as any } }); } catch {}
    }

    revalidatePath('/dashboard/admin/envios');
    try { revalidatePath('/dashboard/admin/envios/online'); } catch {}
    try { revalidatePath('/dashboard/admin/envios/tienda'); } catch {}
    try { revalidatePath('/dashboard/cliente/envios'); } catch {}
    try { revalidatePath('/dashboard/admin/envios/logs'); } catch {}

    return { success: true, data: result };
}

export async function claimDelivery(orderId: string) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const role = (session?.user as any)?.role;
    if (!userId || role !== 'DELIVERY') throw new Error('Not authorized');
    if (!((session?.user as any)?.emailVerified === true)) throw new Error('Email not verified');
    // City guard: only allow Barinas deliveries
    const order_check = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            shippingAddress: true,
            items: {
                include: {
                    product: {
                        select: { id: true, name: true, deliveryAllowedVehicles: true },
                    },
                },
            },
        },
    });
    const city = String(order_check?.shippingAddress?.city || '').toLowerCase();
    if (city !== 'barinas') throw new Error('Not authorized for this city');

    // Configuración global de delivery y sucursales
    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });

    let branch: any = null;
    try {
        // Solo intentamos leer Branch si la tabla existe en la BD
        const existsArr: any = await prisma.$queryRawUnsafe(
            `SELECT to_regclass('\"Branch\"') IS NOT NULL as exists`
        );
        const exists = Array.isArray(existsArr) && existsArr[0] && existsArr[0].exists === true;
        if (exists) {
            branch = await prisma.branch.findFirst({
                where: { isActive: true } as any,
                orderBy: { createdAt: 'asc' },
            });
        }
    } catch {
        branch = null;
    }

    const driver = await prisma.user.findUnique({ where: { id: userId }, select: { deliveryVehicleType: true } });

    const cfg = (settings || {}) as any;
    const vtype = String((driver as any)?.deliveryVehicleType || 'MOTO').toUpperCase();
    if (order_check?.items?.length) {
        for (const item of order_check.items as any[]) {
            const allowed: string[] = Array.isArray(item?.product?.deliveryAllowedVehicles)
                ? (item.product.deliveryAllowedVehicles as string[])
                : [];
            if (!allowed.length) continue;
            const normalized = allowed.map((v) => String(v || '').toUpperCase());
            if (!normalized.includes(vtype)) {
                const label = normalized.join(', ') || 'vehiculo especifico';
                const pname = String(item?.product?.name || item?.name || 'producto');
                throw new Error(`El producto "${pname}" requiere vehiculo: ${label}`);
            }
        }
    }

    const safeNum = (v: any, fallback: number): number => {
        const n = Number(v);
        return isFinite(n) && n > 0 ? n : fallback;
    };

    const motoRate = safeNum(cfg.deliveryMotoRatePerKmUSD, 0.5);
    const carRate = safeNum(cfg.deliveryCarRatePerKmUSD, 0.75);
    const vanRate = safeNum(cfg.deliveryVanRatePerKmUSD, 1);
    const motoMinFee = safeNum(cfg.deliveryMotoMinFeeUSD, 4);
    const vanMinFee = safeNum(cfg.deliveryVanMinFeeUSD, 10);

    let ratePerKm = motoRate;
    let minFee = motoMinFee;
    if (vtype === 'CAMIONETA') {
        ratePerKm = vanRate;
        minFee = vanMinFee;
    } else if (vtype === 'CARRO') {
        ratePerKm = carRate;
        minFee = motoMinFee;
    }

    const addr = (order_check as any)?.shippingAddress as any;
    const hasCoords =
        addr &&
        typeof addr.lat === 'number' &&
        typeof addr.lng === 'number' &&
        branch &&
        typeof branch.lat === 'number' &&
        typeof branch.lng === 'number';

    let fee = minFee;
    if (hasCoords) {
        const km = haversineKm(
            Number(branch.lat),
            Number(branch.lng),
            Number(addr.lat),
            Number(addr.lng),
        );
        const raw = km * ratePerKm;
        fee = raw < minFee ? minFee : Math.round(raw * 100) / 100;
    }

    const updated = await prisma.shipping.updateMany({
        where: { orderId, carrier: 'DELIVERY' as any, assignedToId: null },
        data: {
            assignedToId: userId,
            assignedAt: new Date() as any,
            status: 'EN_TRANSITO' as any,
            deliveryFeeUSD: fee as any,
            branchId: branch?.id || null,
        },
    });
    if (updated.count === 0) throw new Error('Already assigned');
    try { await prisma.auditLog.create({ data: { userId, action: 'DELIVERY_ASSIGNED', details: orderId } }); } catch {}
    try { revalidatePath('/dashboard/delivery'); } catch {}
    try { revalidatePath('/dashboard/admin/envios'); } catch {}
}

export async function completeDelivery(orderId: string, rating?: number) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const role = (session?.user as any)?.role;
    if (!userId || role !== 'DELIVERY') throw new Error('Not authorized');
    if (!((session?.user as any)?.emailVerified === true)) throw new Error('Email not verified');
    const s = await prisma.shipping.findUnique({ where: { orderId } });
    if (!s || s.assignedToId !== userId) throw new Error('Not yours');
    // City guard: only allow Barinas deliveries
    const order_check2 = await prisma.order.findUnique({ where: { id: orderId }, include: { shippingAddress: true } });
    const city2 = String(order_check2?.shippingAddress?.city || '').toLowerCase();
    if (city2 !== 'barinas') throw new Error('Not authorized for this city');
    let safeRating: number | null = null;
    if (typeof rating === 'number' && Number.isFinite(rating) && rating >= 1 && rating <= 5) {
        safeRating = Math.round(rating);
    }
    await prisma.shipping.update({
        where: { orderId },
        data: {
            status: 'ENTREGADO' as any,
            deliveryConfirmedAt: new Date() as any,
            deliveryRating: safeRating,
        },
    });
    try { await prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETADO' as any } }); } catch {}
    try { await prisma.auditLog.create({ data: { userId, action: 'DELIVERY_COMPLETED', details: orderId } }); } catch {}
    try { revalidatePath('/dashboard/delivery'); } catch {}
    try { revalidatePath('/dashboard/admin/envios'); } catch {}
    try { revalidatePath('/dashboard/cliente/envios'); } catch {}
}



export async function markPaidRange(deliveryUserId: string, from: string, to: string) {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
    const fromDate = new Date(from); fromDate.setHours(0,0,0,0);
    const toDate = new Date(to); toDate.setHours(23,59,59,999);
    const orders = await prisma.order.findMany({
        where: {
            shipping: { carrier: 'DELIVERY' as any, assignedToId: deliveryUserId, status: 'ENTREGADO' as any },
            shippingAddress: { city: { equals: 'Barinas', mode: 'insensitive' } as any },
            updatedAt: { gte: fromDate as any, lte: toDate as any },
        },
        select: { id: true },
    });
    const orderIds = orders.map(o => o.id);
    if (orderIds.length === 0) return { updated: 0 };
    const now = new Date();
    const result = await prisma.shipping.updateMany({ where: { orderId: { in: orderIds } }, data: { deliveryPaidAt: now as any } });
    try { revalidatePath('/dashboard/admin/delivery/liquidaciones'); } catch {}
    return { updated: result.count, paidAt: now.toISOString() } as any;
}
