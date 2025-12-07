export const shippingMsg = {
  created: (provider: string, tracking?: string) => `¡Tu pedido ya está en preparación! Proveedor: ${provider}${tracking ? `, Tracking: ${tracking}` : ''}. Te avisaremos cuando salga a ruta.`,
  assigned: 'Tu pedido fue asignado para despacho.',
  in_route: (eta?: string) => `¡En camino! ETA ${eta || ''}.`,
  delivered: '¡Entregado! Gracias por comprar en Carpihogar.',
  incident: 'Tuvimos una incidencia y ya la estamos atendiendo. Te mantendremos informado.',
  driverNewDelivery: (orderId: string, city: string, address: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://carpihogar.com';
    const shortId = orderId.slice(0, 8);
    const addr = address || '';
    return [
      'Nuevo delivery disponible.',
      `Pedido #${shortId} en ${city || 'sin ciudad'}.`,
      addr ? `Dirección: ${addr}.` : '',
      `Tómalo desde tu panel de repartidor: ${baseUrl}/dashboard/delivery`,
    ]
      .filter(Boolean)
      .join(' ');
  },
};
