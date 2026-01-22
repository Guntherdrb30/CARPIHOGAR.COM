import Link from 'next/link';
import { Divider, Button } from '@heroui/react';

type FooterProps = {
  brandName?: string;
  contactEmail?: string;
  contactPhone?: string;
  whatsappPhone?: string;
  supportHours?: string;
};

export default function Footer({ brandName, contactEmail, contactPhone, whatsappPhone, supportHours }: FooterProps) {
  const whatsappNumber = (whatsappPhone || process.env.NEXT_PUBLIC_WHATSAPP_PHONE || '').replace(/\D+/g, '');
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : '#';
  const waText = encodeURIComponent(`Hola ${brandName || 'Carpihogar'}, necesito soporte.`);
  const whatsappSupportUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${waText}` : '#';

  return (
    <footer className="text-white py-10 bg-[var(--color-secondary)]/95 backdrop-blur">
      <div className="container mx-auto px-4 text-center">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xl font-bold mb-2">{brandName || 'Carpihogar.ai'}</h3>
            <p className="text-gray-400">Tu tienda de confianza para el hogar.</p>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Contacto</h3>
            <p className="text-gray-400">Email: {contactEmail || 'root@carpihogar.com'}</p>
            <p className="text-gray-400">Teléfono: {contactPhone || '+58 000-000-0000'}</p>
            <p className="text-gray-400">Horario: {supportHours || 'Lun–Vie 9:00–18:00'}</p>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Envíos</h3>
            <p className="text-gray-400">Envíos a nivel nacional en Venezuela.</p>
            {whatsappNumber ? (
              <Button as="a" href={whatsappUrl} target="_blank" rel="noopener noreferrer" color="success" variant="solid" className="mt-4">
                Contáctanos por WhatsApp
              </Button>
            ) : null}
            {whatsappNumber ? (
              <Button as="a" href={whatsappSupportUrl} target="_blank" rel="noopener noreferrer" color="success" variant="flat" className="mt-2">
                Soporte por WhatsApp
              </Button>
            ) : null}
          </div>

          <div>
            <h3 className="text-xl font-bold mb-2">Legal</h3>
            <ul className="space-y-2 text-gray-400">
              <li><Link href="/terms-of-use">Terminos de Uso</Link></li>
              <li><Link href="/terms-of-sale">Terminos de Venta</Link></li>
              <li><Link href="/company-details">Datos de la Empresa</Link></li>
              <li><Link href="/privacy-cookie-policy">Politica de Privacidad y Cookies</Link></li>
              <li><Link href="/cookie-settings">Configuracion de Cookies</Link></li>
            </ul>
          </div>
        </div>
        <Divider className="my-8 bg-white/10" />
        <p className="text-sm text-gray-300">&copy; {new Date().getFullYear()} {brandName || 'Carpihogar.ai'}. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
