"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { ShippingStatus, ShippingCarrier } from "@prisma/client";
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

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

export async function claimDelivery(orderId: string) {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const role = (session?.user as any)?.role;
    if (!userId || role !== 'DELIVERY') throw new Error('Not authorized');
    if (!((session?.user as any)?.emailVerified === true)) throw new Error('Email not verified');
    // City guard: only allow Barinas deliveries
    const order_check = await prisma.order.findUnique({ where: { id: orderId }, include: { shippingAddress: true } });
    const city = String(order_check?.shippingAddress?.city || '').toLowerCase();
    if (city !== 'barinas') throw new Error('Not authorized for this city');
    const updated = await prisma.shipping.updateMany({
        where: { orderId, carrier: 'DELIVERY' as any, assignedToId: null },
        data: { assignedToId: userId, assignedAt: new Date() as any, status: 'EN_TRANSITO' as any, deliveryFeeUSD: 3 as any },
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
