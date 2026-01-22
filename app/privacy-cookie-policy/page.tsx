export const dynamic = 'force-static';

export default function PrivacyCookiePolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Politica de Privacidad y Cookies</h1>
      <p className="mt-4 text-gray-700">
        Esta politica describe como carpihogar.com recopila y usa datos personales y cookies. Al usar
        el sitio, aceptas esta politica.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Datos que recopilamos</h2>
      <ul className="mt-2 list-disc pl-6 text-gray-700">
        <li>Datos de contacto como nombre, email y telefono.</li>
        <li>Informacion de compra y facturacion.</li>
        <li>Datos tecnicos basicos para seguridad y rendimiento.</li>
      </ul>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Como usamos los datos</h2>
      <ul className="mt-2 list-disc pl-6 text-gray-700">
        <li>Procesar pedidos y brindar soporte.</li>
        <li>Mejorar el servicio y prevenir fraudes.</li>
        <li>Enviar notificaciones relacionadas con tu compra.</li>
      </ul>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Cookies</h2>
      <p className="mt-2 text-gray-700">
        Usamos cookies necesarias para el funcionamiento del sitio y cookies opcionales para analisis
        y mejoras. Puedes ajustar tu eleccion en la pagina de configuracion de cookies.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Compartir datos</h2>
      <p className="mt-2 text-gray-700">
        Podemos compartir datos con proveedores de servicios necesarios para operar el sitio (por
        ejemplo, pagos y envios). No vendemos tu informacion.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Tus derechos</h2>
      <p className="mt-2 text-gray-700">
        Puedes solicitar acceso, correccion o eliminacion de tus datos escribiendo a
        root@carpihogar.com.
      </p>
    </div>
  );
}
