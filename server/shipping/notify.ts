import prisma from '@/lib/prisma';
import { shippingMsg } from './messages';
import { sendWhatsAppText } from '@/lib/whatsapp';
import webpush from 'web-push';

export async function notifyShipmentCreated({ customerId, orderId, provider, trackingCode }: { customerId?: string; orderId: string; provider: string; trackingCode?: string }) {
  if (!customerId) return;
  const user = await prisma.user.findUnique({ where: { id: customerId } });
  const phone = (user as any)?.phone || '';
  if (!phone) return;
  const body = shippingMsg.created(provider, trackingCode);
  await sendWhatsAppText(phone, body).catch(() => ({ ok: false }));
}

export async function notifyShipmentStatus({ customerId, status, eta }: { customerId?: string; status: string; eta?: string }) {
  if (!customerId) return;
  const user = await prisma.user.findUnique({ where: { id: customerId } });
  const phone = (user as any)?.phone || '';
  if (!phone) return;
  let body = '';
  if (status === 'PREPARANDO') body = shippingMsg.created('DELIVERY');
  if (status === 'DESPACHADO') body = shippingMsg.assigned;
  if (status === 'EN_TRANSITO') body = shippingMsg.in_route(eta);
  if (status === 'ENTREGADO') body = shippingMsg.delivered;
  if (status === 'INCIDENCIA') body = shippingMsg.incident;
  if (!body) return;
  await sendWhatsAppText(phone, body).catch(() => ({ ok: false }));
}

export async function notifyDriversNewDelivery({ shipmentId }: { shipmentId: string }) {
  const shipment = await prisma.shipping.findUnique({
    where: { id: shipmentId },
    include: {
      order: {
        include: {
          shippingAddress: true,
        },
      },
    },
  });
  if (!shipment) return;
  if (String(shipment.carrier) !== 'DELIVERY') return;

  const city = String(shipment.order?.shippingAddress?.city || '');
  // Solo disparar notificaciones masivas para entregas internas en Barinas
  if (!/barinas/i.test(city)) return;

  const drivers = await prisma.user.findMany({
    where: {
      role: 'DELIVERY',
      deliveryStatus: 'APPROVED',
    },
    select: { id: true },
  });

  if (!drivers.length) return;

  const address = shipment.order?.shippingAddress?.address1 || '';
  const body = shippingMsg.driverNewDelivery(shipment.orderId, city, address);

  await prisma.notification.createMany({
    data: drivers.map((d) => ({
      userId: d.id,
      type: 'DELIVERY_NEW',
      title: 'Nuevo delivery disponible en Barinas',
      body,
      data: {
        shipmentId,
        orderId: shipment.orderId,
        city,
        address,
      } as any,
    })),
  });

  // Web Push (solo si hay claves VAPID configuradas)
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;

  try {
    webpush.setVapidDetails(
      process.env.WEB_PUSH_SUBJECT || 'mailto:soporte@carpihogar.com',
      publicKey,
      privateKey,
    );
  } catch {
    // configuración inválida, no intentamos enviar
    return;
  }

  const driverIds = drivers.map((d) => d.id);
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: driverIds } },
  });
  if (!subs.length) return;

  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://carpihogar.com';
  const payload = JSON.stringify({
    title: 'Nuevo delivery disponible en Barinas',
    body,
    url: `${baseUrl}/dashboard/delivery`,
  });

  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification(s.data as any, payload)
        .catch(async () => {
          // Si falla (p.ej. suscripción expirada), la eliminamos
          try {
            await prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } });
          } catch {
            // ignore
          }
        }),
    ),
  );
}
