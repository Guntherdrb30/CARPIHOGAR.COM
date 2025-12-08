import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    const url = new URL(req.url);
    const login = new URL("/auth/login", url.origin);
    login.searchParams.set("callbackUrl", url.toString());
    return NextResponse.redirect(login);
  }

  const userId = (session.user as any)?.id as string | undefined;
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      phone: true,
      deliveryCedula: true,
      deliveryAddress: true,
      deliveryVehicleType: true,
      deliveryVehicleBrand: true,
      deliveryVehicleModel: true,
      deliveryMotoPlate: true,
      deliveryChassisSerial: true,
      createdAt: true,
      deliveryAgreementAcceptedAt: true,
      deliveryAgreementVersion: true,
    },
  });

  if (!user) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Uint8Array[] = [];
  doc.on("data", (c: any) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: any) => reject(err));
  });

  const today = new Date();
  const fmtDate = (d: Date | null | undefined) => {
    if (!d) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };

  doc.font("Helvetica-Bold").fontSize(14).text("Contrato de Prestacion de Servicio de Delivery", {
    align: "center",
  });
  doc.moveDown(1);

  doc.font("Helvetica").fontSize(10);
  doc.text(`Fecha de generacion: ${fmtDate(today)}`);
  if (user.deliveryAgreementAcceptedAt) {
    doc.text(
      `Aceptacion digital registrada el: ${fmtDate(
        user.deliveryAgreementAcceptedAt as any,
      )} (version ${user.deliveryAgreementVersion ?? 1})`,
    );
  }

  doc.moveDown(1);
  doc.font("Helvetica-Bold").text("Datos del Delivery:");
  doc.moveDown(0.5);

  const lines = [
    `Nombre completo: ${user.name || ""}`,
    `Correo: ${user.email || ""}`,
    `Telefono de trabajo: ${user.phone || ""}`,
    `Cedula / ID: ${user.deliveryCedula || ""}`,
    `Direccion declarada: ${user.deliveryAddress || ""}`,
    `Vehiculo: ${user.deliveryVehicleType || ""} - Marca: ${user.deliveryVehicleBrand || ""} - Modelo: ${user.deliveryVehicleModel || ""}`,
    `Placa / Serial: ${user.deliveryMotoPlate || ""} - Chasis/VIN: ${user.deliveryChassisSerial || ""}`,
  ];
  lines.forEach((l) => doc.text(l));

  doc.moveDown(1.2);
  doc.font("Helvetica-Bold").text("Clausulas principales:");
  doc.moveDown(0.5);
  doc.font("Helvetica");

  const clauses: string[] = [
    "1. Objeto: El Delivery presta servicios de entrega de productos a clientes de Carpihogar dentro de las zonas autorizadas. La empresa gestiona pedidos y logistica; el Delivery ejecuta el traslado y entrega de la mercancia.",
    "2. Compensacion: La empresa paga al Delivery un monto por cada entrega completada segun las tarifas vigentes y reportes de envios marcados como ENTREGADO.",
    "3. Responsabilidad: El Delivery asume la custodia de la mercancia desde que la recibe hasta la entrega efectiva al cliente o persona autorizada, debiendo reportar de inmediato cualquier incidencia.",
    "4. Independencia: El Delivery actua como prestador independiente de servicios. Este contrato no crea relacion laboral; el Delivery es responsable de su vehiculo, documentos y cumplimiento de la normativa de transito.",
    "5. Conducta: El Delivery se compromete a mantener trato respetuoso con clientes y personal de la empresa, cumplir las direcciones de entrega y conservar evidencias cuando se le solicite.",
    "6. Datos personales: Los datos suministrados (nombre, cedula/ID, telefono, direccion, datos del vehiculo e imagenes) forman parte del respaldo documental de este contrato y de la aceptacion digital registrada en la plataforma.",
    "7. Vigencia: El contrato entra en vigencia desde la aceptacion digital y se mantiene mientras el Delivery preste servicios o hasta su terminacion por cualquiera de las partes, sin perjuicio de liquidaciones pendientes.",
  ];

  clauses.forEach((c) => {
    doc.moveDown(0.3);
    doc.text(c, { align: "justify" });
  });

  doc.moveDown(2);
  const sigY = doc.y;
  const centerX = 300;

  doc.moveTo(60, sigY).lineTo(260, sigY).stroke();
  doc.text("Firma y sello de la empresa", 60, sigY + 4, {
    width: 200,
    align: "center",
  });

  doc.moveTo(centerX, sigY).lineTo(centerX + 200, sigY).stroke();
  doc.text("Firma del Delivery", centerX, sigY + 4, {
    width: 200,
    align: "center",
  });

  doc.end();
  const pdfBuf = await done;

  const fname = `contrato_delivery_${user.name || "usuario"}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}

