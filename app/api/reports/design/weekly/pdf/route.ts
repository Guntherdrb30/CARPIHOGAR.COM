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

const parseDateParam = (value: string | null, endOfDay = false) => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  const dt = new Date(`${raw}${suffix}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const fromParam = parseDateParam(url.searchParams.get("from"), false);
  const toParam = parseDateParam(url.searchParams.get("to"), true);
  const now = new Date();
  const defaultTo = new Date(now);
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 7);
  let from = fromParam || defaultFrom;
  let to = toParam || defaultTo;
  if (from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  const includeAmounts =
    role === "ADMIN" ? url.searchParams.get("includeAmounts") !== "0" : false;

  const range = { gte: from, lte: to };
  const where: any = {
    OR: [
      { createdAt: range },
      { updatedAt: range },
      { startDate: range },
      { dueDate: range },
    ],
  };
  if (role === "ARCHITECTO") {
    where.architectId = userId;
  }

  const projects = await prisma.designProject.findMany({
    where,
    include: {
      architect: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  const projectIds = projects.map((p) => p.id);
  const tasks = projectIds.length
    ? await prisma.designProjectTask.findMany({
        where: { projectId: { in: projectIds }, dueDate: range },
        include: {
          project: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ dueDate: "asc" }, { status: "asc" }],
      })
    : [];

  let paidByProject: Record<string, number> = {};
  let totalPaidUSD = 0;
  if (includeAmounts && projectIds.length) {
    const payments = await prisma.designProjectPayment.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, amountUSD: true },
    });
    for (const p of payments) {
      const amount = toNumberSafe(p.amountUSD, 0);
      paidByProject[p.projectId] = (paidByProject[p.projectId] || 0) + amount;
      totalPaidUSD += amount;
    }
  }

  const totalDesignUSD = projects.reduce(
    (sum, p) => sum + toNumberSafe(p.designTotalUSD, 0),
    0
  );

  const statusCounts = projects.reduce((acc: Record<string, number>, p) => {
    const key = String(p.status || "SIN_ESTADO");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const baseUrl = new URL(req.url).origin;
  const logoBuf = await fetchLogoBuffer((settings as any)?.logoUrl, baseUrl);
  const brandName = (settings as any)?.brandName || "Carpihogar.ai";

  const PDFDocument = (await import("pdfkit/js/pdfkit.standalone.js")).default as any;
  const { doc, done } = createPdfDoc(PDFDocument);

  drawHeader(
    doc,
    {
      title: "Reporte semanal de diseno",
      subtitle: `Rango: ${formatDate(from)} - ${formatDate(to)}`,
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
  doc.text(`Proyectos en rango: ${projects.length}`);
  doc.text(`Tareas con vencimiento: ${tasks.length}`);
  Object.entries(statusCounts).forEach(([k, v]) => {
    doc.text(`Estatus ${String(k).replace(/_/g, " ")}: ${v}`);
  });
  if (includeAmounts) {
    doc.moveDown(0.25);
    doc.text(`Monto total: ${formatMoney(totalDesignUSD)}`);
    doc.text(`Abonos: ${formatMoney(totalPaidUSD)}`);
    doc.text(`Saldo: ${formatMoney(totalDesignUSD - totalPaidUSD)}`);
  }

  sectionTitle(doc, "Proyectos en el periodo");
  if (projects.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#555").text("Sin proyectos en el rango.");
  } else {
    const columns = includeAmounts
      ? [
          { label: "Proyecto", width: 150 },
          { label: "Cliente", width: 90 },
          { label: "Arquitecto", width: 90 },
          { label: "Entrega", width: 70 },
          { label: "Monto", width: 70, align: "right" as const },
          { label: "Saldo", width: 70, align: "right" as const },
        ]
      : [
          { label: "Proyecto", width: 170 },
          { label: "Cliente", width: 100 },
          { label: "Arquitecto", width: 110 },
          { label: "Estatus", width: 70 },
          { label: "Entrega", width: 70 },
        ];

    const rows = projects.map((p) => {
      if (includeAmounts) {
        const total = toNumberSafe(p.designTotalUSD, 0);
        const paid = paidByProject[p.id] || 0;
        const balance = total - paid;
        return [
          p.name.slice(0, 26),
          p.clientName.slice(0, 16),
          p.architect?.name || p.architect?.email || "-",
          formatDate(p.dueDate),
          formatMoney(total),
          formatMoney(balance),
        ];
      }
      return [
        p.name.slice(0, 26),
        p.clientName.slice(0, 16),
        p.architect?.name || p.architect?.email || "-",
        String(p.status).replace(/_/g, " "),
        formatDate(p.dueDate),
      ];
    });
    renderTable(doc, columns as any, rows);
  }

  sectionTitle(doc, "Tareas con vencimiento en rango");
  if (tasks.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#555").text("Sin tareas en el rango.");
  } else {
    const rows = tasks.map((t) => [
      t.title.slice(0, 28),
      t.project?.name.slice(0, 20) || "-",
      t.assignedTo?.name || t.assignedTo?.email || "-",
      formatDate(t.dueDate),
      String(t.status).replace(/_/g, " "),
    ]);
    renderTable(
      doc,
      [
        { label: "Tarea", width: 160 },
        { label: "Proyecto", width: 120 },
        { label: "Responsable", width: 110 },
        { label: "Vence", width: 70 },
        { label: "Estatus", width: 70 },
      ],
      rows
    );
  }

  doc.end();
  const pdf = await done;
  const filename = `reporte_semanal_diseno_${Date.now()}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
