"use server";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  createPdfDoc,
  drawHeader,
  fetchLogoBuffer,
  renderTable,
  sectionTitle,
} from "@/lib/reports/design-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const toNumberSafe = (value: any, fallback = 0) => {
  if (value == null) return fallback;
  if (typeof value === "number") return isFinite(value) ? value : fallback;
  if (typeof value?.toNumber === "function") {
    const n = value.toNumber();
    return isFinite(n) ? n : fallback;
  }
  const n = Number(value);
  return isFinite(n) ? n : fallback;
};

const formatDate = (value?: Date | string | null) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("es-VE");
  } catch {
    return "-";
  }
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD" }).format(value);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const includeAmounts =
    role === "ADMIN" ? url.searchParams.get("includeAmounts") !== "0" : false;

  const project = await prisma.designProject.findUnique({
    where: { id: params.id },
    include: {
      architect: { select: { id: true, name: true, email: true } },
      tasks: {
        include: { assignedTo: { select: { id: true, name: true, email: true } } },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      },
      updates: {
        include: { createdBy: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      payments: includeAmounts
        ? {
            include: { createdBy: { select: { id: true, name: true, email: true } } },
            orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          }
        : undefined,
    },
  });

  if (!project) return new NextResponse("Not Found", { status: 404 });
  if (role === "ARCHITECTO" && project.architectId !== userId) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const baseUrl = new URL(req.url).origin;
  const logoBuf = await fetchLogoBuffer((settings as any)?.logoUrl, baseUrl);
  const brandName = (settings as any)?.brandName || "Carpihogar.ai";

  const PDFDocument = (await import("pdfkit/js/pdfkit.standalone.js")).default as any;
  const { doc, done } = createPdfDoc(PDFDocument);

  drawHeader(
    doc,
    {
      title: "Reporte de proyecto",
      subtitle: `Generado: ${new Date().toLocaleString("es-VE")}`,
      brandName: "Trends172",
      brandColor: "#b91c1c",
      contactEmail: (settings as any)?.contactEmail || "",
      contactPhone: (settings as any)?.contactPhone || "",
      accentColor: "#b91c1c",
      baseUrl,
    },
    logoBuf
  );

  sectionTitle(doc, "Resumen");
  doc.font("Helvetica").fontSize(10).fillColor("#111");
  doc.text(`Proyecto: ${project.name}`);
  doc.text(`Cliente: ${project.clientName}`);
  doc.text(`Ubicacion: ${project.location}`);
  doc.text(
    `Arquitecto: ${project.architect?.name || project.architect?.email || "Sin asignar"}`
  );
  doc.text(`Prioridad: ${project.priority}`);
  doc.text(`Estatus: ${String(project.status).replace(/_/g, " ")}`);
  doc.text(`Etapa: ${String(project.stage).replace(/_/g, " ")}`);
  doc.text(`Inicio: ${formatDate(project.startDate)}`);
  doc.text(`Entrega: ${formatDate(project.dueDate)}`);
  if (project.description) {
    doc.moveDown(0.25);
    doc.text(`Descripcion: ${project.description}`);
  }

  if (includeAmounts) {
    const totalUSD = project.designTotalUSD != null ? toNumberSafe(project.designTotalUSD, 0) : 0;
    const paidUSD = Array.isArray((project as any).payments)
      ? (project as any).payments.reduce(
          (sum: number, p: any) => sum + toNumberSafe(p.amountUSD, 0),
          0
        )
      : 0;
    const balanceUSD = totalUSD - paidUSD;
    doc.moveDown(0.5);
    doc.text(`Monto total: ${formatMoney(totalUSD)}`);
    doc.text(`Abonos: ${formatMoney(paidUSD)}`);
    doc.text(`Saldo: ${formatMoney(balanceUSD)}`);
  }

  sectionTitle(doc, "Tareas");
  if (project.tasks.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#555").text("Sin tareas registradas.");
  } else {
    const taskRows = project.tasks.map((t) => [
      t.title.slice(0, 40),
      t.assignedTo?.name || t.assignedTo?.email || "-",
      formatDate(t.dueDate),
      String(t.status).replace(/_/g, " "),
    ]);
    renderTable(
      doc,
      [
        { label: "Tarea", width: 200 },
        { label: "Responsable", width: 140 },
        { label: "Fecha limite", width: 90 },
        { label: "Estatus", width: 90 },
      ],
      taskRows
    );
  }

  sectionTitle(doc, "Avances");
  if (project.updates.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#555").text("Sin avances registrados.");
  } else {
    for (const u of project.updates) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111");
      doc.text(
        `${u.createdBy?.name || u.createdBy?.email || "Usuario"} - ${new Date(
          u.createdAt as any
        ).toLocaleString("es-VE")}`
      );
      doc.font("Helvetica").fontSize(9).fillColor("#333");
      if (u.note) doc.text(u.note);
      if (u.fileUrl) doc.text(`Archivo: ${u.fileUrl}`);
      doc.moveDown(0.4);
    }
  }

  if (includeAmounts) {
    sectionTitle(doc, "Abonos");
    const payments = Array.isArray((project as any).payments) ? (project as any).payments : [];
    if (payments.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#555").text("Sin abonos registrados.");
    } else {
      const rows = payments.map((p: any) => [
        formatDate(p.paidAt),
        String(p.method || "-").replace(/_/g, " "),
        formatMoney(toNumberSafe(p.amountUSD, 0)),
        p.reference || "-",
      ]);
      renderTable(
        doc,
        [
          { label: "Fecha", width: 80 },
          { label: "Metodo", width: 110 },
          { label: "Monto", width: 90, align: "right" },
          { label: "Referencia", width: 210 },
        ],
        rows
      );
    }
  }

  doc.end();
  const pdf = await done;
  const filename = `reporte_proyecto_${project.id.slice(0, 8)}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
