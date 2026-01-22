export const dynamic = 'force-static';

export default function TermsOfUsePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Terminos de Uso</h1>
      <p className="mt-4 text-gray-700">
        Al acceder y usar carpihogar.com, aceptas estos Terminos de Uso. Si no estas de acuerdo, no uses
        el sitio.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Uso del sitio</h2>
      <ul className="mt-2 list-disc pl-6 text-gray-700">
        <li>Debes usar el sitio de forma legal y respetuosa.</li>
        <li>No puedes intentar acceder a areas restringidas o vulnerar la seguridad.</li>
        <li>Podemos suspender cuentas o accesos ante uso indebido.</li>
      </ul>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Contenido e informacion</h2>
      <p className="mt-2 text-gray-700">
        La informacion del sitio puede cambiar sin previo aviso. Hacemos esfuerzos razonables para
        mantenerla actualizada, pero no garantizamos exactitud total.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Propiedad intelectual</h2>
      <p className="mt-2 text-gray-700">
        El contenido, marcas y materiales del sitio son propiedad de Carpihogar o de sus titulares
        correspondientes. No puedes copiar ni reutilizar sin autorizacion.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Cambios a estos terminos</h2>
      <p className="mt-2 text-gray-700">
        Podemos actualizar estos Terminos de Uso. La version vigente se publicara en esta pagina.
      </p>
      <h2 className="mt-8 text-xl font-semibold text-gray-900">Contacto</h2>
      <p className="mt-2 text-gray-700">
        Si tienes dudas, escribe a root@carpihogar.com.
      </p>
    </div>
  );
}
