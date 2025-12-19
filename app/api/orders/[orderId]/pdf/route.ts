import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getPriceAdjustmentSettings } from "@/server/price-adjustments";

// Ensure Node.js runtime for pdfkit on Vercel/Next.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchLogoBuffer(logoUrl?: string): Promise<Buffer | null> {
  try {
    if (!logoUrl) return null;

    if (logoUrl.startsWith("http")) {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    }

    const trimmed = logoUrl.startsWith("/") ? logoUrl.slice(1) : logoUrl;
    const fs = await import("fs");
    const path = await import("path");
    const p = path.join(process.cwd(), "public", trimmed);
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  } catch {
    // ignore logo errors
  }
  return null;
}

function formatAmount(v: number) {
  return v.toFixed(2);
}

function padLeft(num: number, width: number) {
  const s = String(num);
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}

export async function GET(req: Request, { params }: { params: { orderId: string } }) {
  const session = await getServerSession(authOptions);

  // If not logged in, redirect to login with callback to this PDF
  if (!session?.user) {
    const url = new URL(req.url);
    const tipoRaw = (url.searchParams.get("tipo") || "recibo").toLowerCase();
    const monedaRaw = (url.searchParams.get("moneda") || "VES").toUpperCase();

    const login = new URL("/auth/login", url.origin);
    const callbackUrl = new URL(`/api/orders/${params.orderId}/pdf`, url.origin);
    callbackUrl.searchParams.set("tipo", tipoRaw);
    callbackUrl.searchParams.set("moneda", monedaRaw);
    login.searchParams.set("callbackUrl", callbackUrl.toString());

    return NextResponse.redirect(login);
  }

  const url = new URL(req.url);
  const tipoRaw = (url.searchParams.get("tipo") || "recibo").toLowerCase();
  const allowedDocs = ["recibo", "factura"] as const;
  const tipo = (allowedDocs as readonly string[]).includes(tipoRaw)
    ? (tipoRaw as "recibo" | "factura")
    : "recibo";

  // Por ahora todos los montos del PDF se muestran en VES
  const moneda: "VES" = "VES";
  const orderId = params.orderId;

  try {
    const userId = (session.user as any)?.id;
    const role = String((session.user as any)?.role || "");

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        seller: true,
        items: true,
        payment: true,
        shipping: true,
        shippingAddress: true,
      },
    });

    if (!order) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const isOwner = order.userId === userId;
    const isSeller = String(order.sellerId || "") === String(userId || "");
    const isAdminLike = ["ADMIN", "VENDEDOR", "ALIADO"].includes(role.toUpperCase());

    if (!(isOwner || isSeller || isAdminLike)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    const pricing = await getPriceAdjustmentSettings();

    // Correlativos (solo se asignan la primera vez)
    let invoiceNumber = (order as any).invoiceNumber as number | null | undefined;
    let receiptNumber = (order as any).receiptNumber as number | null | undefined;

    if (tipo === "factura" && !invoiceNumber) {
      invoiceNumber = await prisma.$transaction(async (tx) => {
        const s = await tx.siteSettings.findUnique({
          where: { id: 1 },
          select: { invoiceNextNumber: true },
        });
        const next = Number((s as any)?.invoiceNextNumber ?? 1) || 1;
        await tx.siteSettings.update({
          where: { id: 1 },
          data: { invoiceNextNumber: next + 1 },
        });
        await tx.order.update({ where: { id: orderId }, data: { invoiceNumber: next } });
        return next;
      });
    }

    if (tipo === "recibo" && !receiptNumber) {
      receiptNumber = await prisma.$transaction(async (tx) => {
        const s = await tx.siteSettings.findUnique({
          where: { id: 1 },
          select: { receiptNextNumber: true },
        });
        const next = Number((s as any)?.receiptNextNumber ?? 1) || 1;
        await tx.siteSettings.update({
          where: { id: 1 },
          data: { receiptNextNumber: next + 1 },
        });
        await tx.order.update({ where: { id: orderId }, data: { receiptNumber: next } });
        return next;
      });
    }

    // Logo: configurado, luego Trends172, luego genérico
    const logoBuf =
      (await fetchLogoBuffer((settings as any)?.logoUrl)) ||
      (await fetchLogoBuffer("/trends172-logo.png")) ||
      (await fetchLogoBuffer("/logo-default.svg"));

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Uint8Array[] = [];
    doc.on("data", (c: any) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: any) => reject(err));
    });

    const ivaPercent = Number(order.ivaPercent || (settings as any)?.ivaPercent || 16);
    const tasaVES = Number(order.tasaVES || (settings as any)?.tasaVES || 40);
    const toMoney = (v: number) => v * tasaVES;
    const money = (v: number) => `Bs ${formatAmount(v)}`;

    // Totales base en USD
    let subtotalUSD = 0;
    for (const it of order.items as any[]) {
      const p = Number((it as any).priceUSD || 0);
      const q = Number((it as any).quantity || 0);
      subtotalUSD += p * q;
    }
    const deliveryFeeUSD = Number((order as any).shipping?.deliveryFeeUSD || 0);
    subtotalUSD += deliveryFeeUSD;

    const paymentCurrency = String(
      (order.payment as any)?.currency || "USD",
    ).toUpperCase();
    const isDivisa = paymentCurrency === "USD" || paymentCurrency === "USDT";

    const discountPercent = isDivisa && pricing.usdPaymentDiscountEnabled
      ? Number(pricing.usdPaymentDiscountPercent || 0) / 100
      : 0;
    const discountUSD = subtotalUSD * discountPercent;
    const taxableBaseUSD = subtotalUSD - discountUSD;
    const ivaUSD = taxableBaseUSD * (ivaPercent / 100);

    const totalSinIgtfUSD = taxableBaseUSD + ivaUSD;
    const igtfUSD = isDivisa ? totalSinIgtfUSD * 0.03 : 0;
    const totalOperacionUSD = totalSinIgtfUSD + igtfUSD;

    const subtotalBs = toMoney(subtotalUSD);
    const ivaBs = toMoney(ivaUSD);
    const discountBs = toMoney(discountUSD);
    const igtfBs = toMoney(igtfUSD);
    const totalOperacionBs = toMoney(totalOperacionUSD);

    const user = order.user as any;
    const seller = order.seller as any;

    const legalName = (settings as any)?.legalCompanyName || "Trends172, C.A";
    const legalRif = (settings as any)?.legalCompanyRif || "J-31758009-5";
    const legalAddress =
      (settings as any)?.legalCompanyAddress ||
      "Av. Industrial, Edificio Teka, Ciudad Barinas, Estado Barinas";
    const legalPhone = (settings as any)?.legalCompanyPhone || "04245192679";

    const brandName = settings?.brandName || "Carpihogar.ai";
    const contactPhone = (settings as any)?.contactPhone || "";
    const contactEmail = (settings as any)?.contactEmail || "";

    // Header --------------------------------------------------------
    if (logoBuf) {
      try {
        doc.image(logoBuf, 40, 30, { height: 40 });
      } catch {
        // ignore image error
      }
    }

    if (tipo === "factura") {
      // Encabezado legal
      doc.fontSize(14).fillColor("#111").text(legalName, logoBuf ? 100 : 40, 30);
      doc.fontSize(10).fillColor("#444");
      doc.text(`RIF: ${legalRif}`, logoBuf ? 100 : 40);
      doc.text(legalAddress, logoBuf ? 100 : 40, doc.y);
      if (legalPhone) {
        doc.text(`Teléfono: ${legalPhone}`, logoBuf ? 100 : 40, doc.y);
      }
      const rightX = 420;
      const numStr = invoiceNumber ? padLeft(invoiceNumber, 6) : "000000";
      doc.fontSize(10).fillColor("#111").text("FORMA LIBRE", rightX, 30);
      doc.text(`NRO DE CONTROL: 00-${numStr}`, rightX, doc.y);
      doc.text(`FACTURA ${numStr}`, rightX, doc.y + 10);
      doc.text(
        `Fecha: ${new Date(order.createdAt as any).toLocaleDateString("es-VE")}`,
        rightX,
        doc.y,
      );
    } else {
      // Encabezado de recibo Carpihogar
      doc
        .fontSize(18)
        .fillColor("#111")
        .text(String(brandName), logoBuf ? 90 : 40, 35);
      doc.fontSize(10).fillColor("#444");
      if (contactEmail) doc.text(contactEmail, logoBuf ? 90 : 40);
      if (contactPhone) doc.text(contactPhone, logoBuf ? 90 : 40);
      if (receiptNumber) {
        const rec = padLeft(receiptNumber, 6);
        doc.text(`RECIBO ${rec}`, 420, 35);
      }
    }

    doc.moveDown();
    doc.moveTo(40, 90).lineTo(555, 90).strokeColor("#ddd").stroke();

    // Operation info ------------------------------------------------
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#111").text("Datos de la operación", 40, doc.y);
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor("#333");

    const infoTopY = doc.y;
    const leftX = 40;
    const rightX = 320;
    const lineHeight = 12;

    const phone =
      (order as any)?.shippingAddress?.phone || (user?.phone as string | undefined) || "";

    const leftLines: string[] = [];
    leftLines.push(`Cliente: ${user?.name || user?.email || "-"}`);
    if (order.customerTaxId) {
      leftLines.push(`Cédula/RIF: ${order.customerTaxId}`);
    }
    if (order.customerFiscalAddress) {
      leftLines.push(`Dirección fiscal: ${order.customerFiscalAddress}`);
    }
    if (phone) {
      leftLines.push(`Teléfono: ${phone}`);
    }

    const rightLines: string[] = [];
    if (seller) {
      rightLines.push(`Vendedor: ${seller.name || seller.email || ""}`);
    }
    rightLines.push(
      `Fecha: ${new Date(order.createdAt as any).toLocaleString("es-VE", {
        dateStyle: "short",
        timeStyle: "short",
      })}`,
    );
    rightLines.push(`Moneda: ${moneda}`);
    rightLines.push(`IVA: ${ivaPercent}%  -  Tasa: ${tasaVES}`);

    if (order.payment) {
      const pay = order.payment as any;
      rightLines.push(
        `Pago: ${pay.method || "-"} - ${pay.currency || "USD"}${
          pay.reference ? ` - Ref: ${pay.reference}` : ""
        }`,
      );
    }

    leftLines.forEach((line, idx) => {
      doc.text(line, leftX, infoTopY + idx * lineHeight, {
        width: rightX - leftX - 10,
      });
    });

    rightLines.forEach((line, idx) => {
      doc.text(line, rightX, infoTopY + idx * lineHeight, {
        width: 555 - rightX,
      });
    });

    const infoLines = Math.max(leftLines.length, rightLines.length);
    doc.y = infoTopY + infoLines * lineHeight + 8;

    // Products ------------------------------------------------------
    doc.moveDown(0.8);
    doc.fontSize(11).fillColor("#111").text("Productos", 40, doc.y);
    doc.moveDown(0.3);

    const startX = 40;
    // Usable width: from 40 (margin) to 555 -> 515 points
    const colWidths = [30, 70, 240, 60, 60, 55]; // sum = 515
    const headers = ["Cant", "Código", "Descripción del Producto", "Precio", "Total", "Kg/Und"];

    doc.fontSize(9).fillColor("#333");
    headers.forEach((h, i) => {
      const offset = colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(h, startX + offset, doc.y, { width: colWidths[i] });
    });

    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(555, doc.y).strokeColor("#eee").stroke();

    for (const it of order.items as any[]) {
      const p = Number((it as any).priceUSD || 0);
      const q = Number((it as any).quantity || 0);
      const sub = p * q;
      const code =
        (it as any).product?.code || (it as any).product?.sku || (it as any).productId || "";

      const cols = [
        String(q),
        String(code || ""),
        (it as any).name || (it as any).product?.name || "Producto",
        money(toMoney(p)),
        money(toMoney(sub)),
        "", // peso/unidad (no disponible aún)
      ];

      cols.forEach((c, i) => {
        const offset = colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.fillColor("#111").text(c, startX + offset, doc.y, { width: colWidths[i] });
      });
      doc.moveDown(0.2);
    }

    if (deliveryFeeUSD > 0) {
      const cols = [
        "1",
        "",
        "Delivery local (moto)",
        money(toMoney(deliveryFeeUSD)),
        money(toMoney(deliveryFeeUSD)),
        "",
      ];
      cols.forEach((c, i) => {
        const offset = colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.fillColor("#111").text(c, startX + offset, doc.y, { width: colWidths[i] });
      });
      doc.moveDown(0.2);
    }

    // Totals --------------------------------------------------------
    doc.moveDown(1);

    const totalsLabelX = 400;
    const totalsValueX = 495;
    const totalsWidth = 90;

    const writeTotalLine = (label: string, value: string, bold = false) => {
      const lineY = doc.y;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica");
      doc.text(label, totalsLabelX, lineY);
      doc.text(value, totalsValueX, lineY, {
        align: "right",
        width: totalsWidth,
      });
      doc.moveDown(0.25);
    };

    doc.fontSize(10).fillColor("#111");

    writeTotalLine("Base imponible:", money(subtotalBs));
    writeTotalLine(`I.V.A. (${ivaPercent}%):`, money(ivaBs));

    if (discountUSD > 0) {
      const pctLabel = Number(pricing.usdPaymentDiscountPercent || 0).toFixed(2);
      writeTotalLine(`Descuento ${pctLabel}% pago USD:`, `- ${money(discountBs)}`);
    }

    writeTotalLine("I.G.T.F. 3%:", money(igtfBs));
    writeTotalLine("Total operación:", money(totalOperacionBs), true);

    // Footer --------------------------------------------------------
    doc.moveDown(1);
    doc.fontSize(9).fillColor("#555");

    if (tipo === "factura") {
      doc.text(
        "Documento generado por sistemas Carpihogar / Trends172, C.A. SOLO EL ORIGINAL DA DERECHO A CRÉDITO FISCAL.",
        40,
        doc.y,
        { width: 515 },
      );
    } else {
      doc.text(
        "Recibo informativo generado por sistemas Carpihogar. No constituye factura fiscal.",
        40,
        doc.y,
        { width: 515 },
      );
    }

    doc.end();
    const pdfBuf = await done;

    const fname =
      tipo === "factura" && invoiceNumber
        ? `factura_${padLeft(invoiceNumber, 6)}.pdf`
        : `${tipo}_${order.id}.pdf`;

    const resp = new NextResponse(new Uint8Array(pdfBuf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fname}"`,
        "Cache-Control": "no-store",
      },
    });

    return resp;
  } catch (e) {
    console.error("[orders/pdf] Error generating PDF:", e);
    return new NextResponse(`Error: ${String(e)}`, { status: 500 });
  }
}
