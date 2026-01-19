import { log } from '../../lib/logger';
import { prisma } from '../../lib/db';

export async function run(input: { sessionId?: string; customerId?: string }) {
  try {
    const ownerKey = (input?.customerId || input?.sessionId || '').trim();
    if (!ownerKey) {
      return { success: false, message: 'Falta customerId o sessionId', data: null };
    }
    const cart = await prisma.assistantCart.findFirst({
      where: { ownerKey },
      select: { id: true },
    });
    if (!cart) {
      return { success: true, message: 'Carrito vacio', data: null };
    }
    await prisma.assistantCart.delete({ where: { id: cart.id } });
    log('mcp.cart.clear', { ownerKey });
    return { success: true, message: 'Carrito vaciado', data: null };
  } catch (e: any) {
    return {
      success: false,
      message: String(e?.message || 'No se pudo vaciar el carrito'),
      data: null,
    };
  }
}
