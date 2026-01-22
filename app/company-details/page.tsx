export const dynamic = 'force-static';

export default function CompanyDetailsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Company Details</h1>
      <div className="mt-4 space-y-2 text-gray-700">
        <div><span className="font-medium">Nombre comercial:</span> carpihogar.com</div>
        <div><span className="font-medium">Razon social:</span> trends172,ca</div>
        <div><span className="font-medium">RIF:</span> J-31758009-5</div>
        <div><span className="font-medium">Email:</span> root@carpihogar.com</div>
        <div><span className="font-medium">Direccion:</span> Av Industrial, Edificio Teca, Barinas, Estado Barinas, Venezuela</div>
        <div><span className="font-medium">Telefonos:</span> 04245262306</div>
      </div>
    </div>
  );
}
