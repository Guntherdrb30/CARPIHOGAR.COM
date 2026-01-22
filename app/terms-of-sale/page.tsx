export const dynamic = 'force-static';

export default function TermsOfSalePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Terms of Sale</h1>
      <p className="mt-4 text-gray-700">
        Estos Terminos de Venta aplican a las compras realizadas en carpihogar.com o en canales
        asociados de Carpihogar.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Precios y disponibilidad</h2>
      <p className="mt-2 text-gray-700">
        Los precios y la disponibilidad pueden cambiar sin previo aviso. La compra se confirma al
        completarse el pago y la validacion correspondiente.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Pagos</h2>
      <p className="mt-2 text-gray-700">
        Aceptamos los metodos de pago disponibles en el sitio. En algunos casos el pago puede
        requerir validacion adicional.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Envios y entregas</h2>
      <p className="mt-2 text-gray-700">
        Los tiempos de entrega son estimados y pueden variar por disponibilidad, distancia y
        condiciones operativas. El cliente debe suministrar datos correctos de entrega.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Cambios y devoluciones</h2>
      <p className="mt-2 text-gray-700">
        Para solicitudes de cambio o devolucion, contacta a soporte con los datos de tu compra.
        Aplican condiciones segun el tipo de producto y el estado del mismo.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Soporte</h2>
      <p className="mt-2 text-gray-700">
        Para ayuda con tu compra, escribe a root@carpihogar.com.
      </p>
    </div>
  );
}
