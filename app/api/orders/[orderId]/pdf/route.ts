import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import PDFDocument from "pdfkit";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getPriceAdjustmentSettings } from "@/server/price-adjustments";

// Ensure Node.js runtime for pdfkit on Vercel/Next.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchLogoBuffer(logoUrl?: string, baseUrl?: string): Promise<Buffer | null> {
  try {
    if (!logoUrl) return null;

    const resolvedUrl = logoUrl.startsWith("http")
      ? logoUrl
      : baseUrl
        ? new URL(logoUrl, baseUrl).toString()
        : "";

    if (!resolvedUrl) return null;

    const res = await fetch(resolvedUrl);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
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
        items: {
          include: {
            product: {
              select: {
                sku: true,
                code: true,
                supplierCode: true,
                barcode: true,
                name: true,
              },
            },
          },
        },
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

    const baseUrl = url.origin;
    // Logo: configurado, luego Trends172, luego genérico
    const logoBuf =
      (await fetchLogoBuffer((settings as any)?.logoUrl, baseUrl)) ||
      (await fetchLogoBuffer("/trends172-logo.png", baseUrl)) ||
      (await fetchLogoBuffer("/logo-default.svg", baseUrl));

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
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = doc.page.margins.left;
    const left = margin;
    const right = pageWidth - margin;
    const contentWidth = right - left;

    const colors = {
      text: "#111111",
      muted: "#4b5563",
      border: "#e5e7eb",
      soft: "#f8fafc",
      header: "#f3f4f6",
    };
    const accent = (settings as any)?.primaryColor || "#E24B3C";

    const drawWatermark = () => {
      const watermarkSize = Math.min(pageWidth, pageHeight) * 0.55;
      doc.save();
      doc.opacity(0.06);
      if (logoBuf) {
        doc.image(logoBuf, (pageWidth - watermarkSize) / 2, (pageHeight - watermarkSize) / 2, {
          fit: [watermarkSize, watermarkSize],
          align: "center",
          valign: "center",
        });
      } else {
        doc
          .fontSize(64)
          .fillColor("#999")
          .text(String(brandName), 0, pageHeight / 2 - 40, { align: "center" });
      }
      doc.restore();
    };

    const sectionTitle = (title: string) => {
      const y = doc.y + 6;
      doc.save();
      doc.fillColor(colors.header).rect(left, y, contentWidth, 18).fill();
      doc.restore();
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(colors.text)
        .text(title, left + 8, y + 4);
      doc.y = y + 24;
    };

    drawWatermark();

    const logoBox = { x: left, y: 30, width: 70, height: 42 };
    if (logoBuf) {
      try {
        doc.image(logoBuf, logoBox.x, logoBox.y, { fit: [logoBox.width, logoBox.height] });
      } catch {
        // ignore image error
      }
    }

    const headerLeftX = logoBuf ? logoBox.x + logoBox.width + 12 : left;
    const headerTop = 30;
    const docDate = new Date(order.createdAt as any);
    const docDateLabel = docDate.toLocaleDateString("es-VE");
    const docNumber = tipo === "factura"
      ? invoiceNumber
        ? padLeft(invoiceNumber, 6)
        : "000000"
      : receiptNumber
        ? padLeft(receiptNumber, 6)
        : "000000";

    doc.fontSize(13).font("Helvetica-Bold").fillColor(colors.text);
    doc.text(tipo === "factura" ? legalName : brandName, headerLeftX, headerTop);
    doc.fontSize(9).font("Helvetica").fillColor(colors.muted);

    if (tipo === "factura") {
      doc.text(`RIF: ${legalRif}`, headerLeftX, doc.y + 2);
      doc.text(legalAddress, headerLeftX, doc.y);
      if (legalPhone) {
        doc.text(`Telefono: ${legalPhone}`, headerLeftX, doc.y);
      }
    } else {
      if (contactEmail) doc.text(contactEmail, headerLeftX, doc.y + 2);
      if (contactPhone) doc.text(contactPhone, headerLeftX, doc.y);
    }

    const boxWidth = 190;
    const boxHeight = tipo === "factura" ? 64 : 52;
    const boxX = right - boxWidth;
    const boxY = headerTop - 2;

    if (tipo === "factura") {
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(colors.muted)
        .text("FORMA LIBRE", boxX, boxY - 12, { width: boxWidth, align: "right" });
    }

    doc.save();
    doc.fillColor(colors.header).rect(boxX, boxY, boxWidth, boxHeight).fill();
    doc.strokeColor(colors.border).rect(boxX, boxY, boxWidth, boxHeight).stroke();
    doc.restore();

    doc.fontSize(12).font("Helvetica-Bold").fillColor(colors.text);
    doc.text(tipo === "factura" ? "FACTURA" : "RECIBO", boxX + 10, boxY + 6);
    doc.fontSize(9).font("Helvetica").fillColor(colors.text);
    doc.text(`Nro: ${docNumber}`, boxX + 10, boxY + 24);
    if (tipo === "factura") {
      doc.text(`Control: 00-${docNumber}`, boxX + 10, boxY + 36);
      doc.text(`Fecha: ${docDateLabel}`, boxX + 10, boxY + 48);
    } else {
      doc.text(`Fecha: ${docDateLabel}`, boxX + 10, boxY + 36);
    }

    doc.save();
    doc.strokeColor(accent).lineWidth(2).moveTo(left, 28).lineTo(right, 28).stroke();
    doc.restore();

    const headerBottomY = Math.max(doc.y, boxY + boxHeight) + 10;
    doc.moveTo(left, headerBottomY).lineTo(right, headerBottomY).strokeColor(colors.border).stroke();
    doc.y = headerBottomY + 6;

    // Operation info ------------------------------------------------
    sectionTitle("Datos de la operacion");

    const infoTopY = doc.y;
    const leftX = left;
    const rightX = left + Math.round(contentWidth * 0.58);
    const lineHeight = 12;

    const phone =
      (order as any)?.shippingAddress?.phone || (user?.phone as string | undefined) || "";

    const leftLines: string[] = [];
    leftLines.push(`Cliente: ${user?.name || user?.email || "-"}`);
    if (order.customerTaxId) {
      leftLines.push(`Cedula/RIF: ${order.customerTaxId}`);
    }
    if (order.customerFiscalAddress) {
      leftLines.push(`Direccion fiscal: ${order.customerFiscalAddress}`);
    }
    if (phone) {
      leftLines.push(`Telefono: ${phone}`);
    }

    const rightLines: string[] = [];
    if (seller) {
      rightLines.push(`Vendedor: ${seller.name || seller.email || ""}`);
    }
    rightLines.push(
      `Fecha: ${docDate.toLocaleString("es-VE", {
        dateStyle: "short",
        timeStyle: "short",
      })}`,
    );
    rightLines.push(`Moneda: ${moneda}`);
    rightLines.push(`IVA: ${ivaPercent}%  -  Tasa: ${tasaVES}`);

    if (order.payment) {
      const pay = order.payment as any;
      let paymentLine = `Pago: ${pay.method || "-"} - ${pay.currency || "USD"}`;
      if (pay.reference) {
        paymentLine += ` - Ref: ${pay.reference}`;
      }
      rightLines.push(paymentLine);
    }

    const infoLines = Math.max(leftLines.length, rightLines.length);
    const infoBoxHeight = infoLines * lineHeight + 8;

    doc.save();
    doc.fillColor(colors.soft).rect(left, infoTopY - 4, contentWidth, infoBoxHeight + 8).fill();
    doc.strokeColor(colors.border).rect(left, infoTopY - 4, contentWidth, infoBoxHeight + 8).stroke();
    doc.restore();

    doc.fontSize(9).font("Helvetica").fillColor(colors.text);
    leftLines.forEach((line, idx) => {
      doc.text(line, leftX, infoTopY + idx * lineHeight, {
        width: rightX - leftX - 12,
      });
    });

    rightLines.forEach((line, idx) => {
      doc.text(line, rightX, infoTopY + idx * lineHeight, {
        width: right - rightX,
      });
    });

    doc.y = infoTopY + infoBoxHeight + 10;

    // Products ------------------------------------------------------
    sectionTitle("Productos");

    const startX = left;
    const colWidths = [32, 70, 230, 60, 60, contentWidth - 452];
    const headers = ["Cant", "Codigo", "Descripcion del producto", "Precio", "Total", "Kg/Und"];
    const aligns: Array<"left" | "right" | "center"> = [
      "center",
      "left",
      "left",
      "right",
      "right",
      "right",
    ];

    const headerRowY = doc.y;
    doc.save();
    doc.fillColor(colors.header).rect(startX, headerRowY - 2, contentWidth, 18).fill();
    doc.restore();

    doc.fontSize(9).font("Helvetica-Bold").fillColor(colors.muted);
    headers.forEach((h, i) => {
      const offset = colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(h, startX + offset, headerRowY + 2, { width: colWidths[i], align: aligns[i] });
    });

    doc.y = headerRowY + 20;
    doc.moveTo(startX, doc.y).lineTo(right, doc.y).strokeColor(colors.border).stroke();
    doc.y += 4;

    let rowIndex = 0;
    const renderRow = (cols: string[]) => {
      const rowY = doc.y;
      const descHeight = doc.heightOfString(cols[2], { width: colWidths[2] });
      const rowHeight = Math.max(18, descHeight + 6);

      if (rowIndex % 2 === 1) {
        doc.save();
        doc.fillColor("#fcfcfd").rect(startX, rowY - 2, contentWidth, rowHeight).fill();
        doc.restore();
      }

      cols.forEach((c, i) => {
        const offset = colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(colors.text)
          .text(c, startX + offset, rowY, {
            width: colWidths[i],
            align: aligns[i],
          });
      });

      doc.y = rowY + rowHeight;
      rowIndex += 1;
    };

    for (const it of order.items as any[]) {
      const p = Number((it as any).priceUSD || 0);
      const q = Number((it as any).quantity || 0);
      const sub = p * q;
      const product = (it as any).product as any | undefined;
      const code =
        product?.sku ||
        product?.code ||
        product?.supplierCode ||
        product?.barcode ||
        "";

      renderRow([
        String(q),
        String(code || "SIN CODIGO"),
        (it as any).name || product?.name || "Producto",
        money(toMoney(p)),
        money(toMoney(sub)),
        "",
      ]);
    }

    if (deliveryFeeUSD > 0) {
      renderRow([
        "1",
        "",
        "Delivery local (moto)",
        money(toMoney(deliveryFeeUSD)),
        money(toMoney(deliveryFeeUSD)),
        "",
      ]);
    }

    // Totals --------------------------------------------------------
    doc.moveDown(0.8);

    const totalsLines: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Base imponible", value: money(subtotalBs) },
      { label: `I.V.A. (${ivaPercent}%)`, value: money(ivaBs) },
    ];

    if (discountUSD > 0) {
      const pctLabel = Number(pricing.usdPaymentDiscountPercent || 0).toFixed(2);
      totalsLines.push({
        label: `Descuento ${pctLabel}% pago USD`,
        value: `- ${money(discountBs)}`,
      });
    }

    totalsLines.push({ label: "I.G.T.F. 3%", value: money(igtfBs) });
    totalsLines.push({ label: "Total operacion", value: money(totalOperacionBs), bold: true });

    const totalsBoxWidth = 210;
    const totalsX = right - totalsBoxWidth;
    const totalsY = doc.y + 4;
    const totalsLineHeight = 13;
    const totalsHeight = totalsLines.length * totalsLineHeight + 12;

    doc.save();
    doc.fillColor(colors.soft).rect(totalsX, totalsY, totalsBoxWidth, totalsHeight).fill();
    doc.strokeColor(colors.border).rect(totalsX, totalsY, totalsBoxWidth, totalsHeight).stroke();
    doc.restore();

    let totalsCursor = totalsY + 6;
    totalsLines.forEach((line) => {
      doc.font(line.bold ? "Helvetica-Bold" : "Helvetica");
      doc.fontSize(9).fillColor(colors.text);
      doc.text(line.label, totalsX + 8, totalsCursor, { width: totalsBoxWidth - 16 });
      doc.text(line.value, totalsX + 8, totalsCursor, {
        width: totalsBoxWidth - 16,
        align: "right",
      });
      totalsCursor += totalsLineHeight;
    });

    doc.y = totalsY + totalsHeight + 10;

    // Footer --------------------------------------------------------
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(colors.border).stroke();
    doc.moveDown(0.6);
    doc.fontSize(8).fillColor(colors.muted);

    if (tipo === "factura") {
      doc.text(
        "Documento generado por sistemas Carpihogar / Trends172, C.A. SOLO EL ORIGINAL DA DERECHO A CREDITO FISCAL.",
        left,
        doc.y,
        { width: contentWidth, align: "center" },
      );
    } else {
      doc.text(
        "Recibo informativo generado por sistemas Carpihogar. No constituye factura fiscal.",
        left,
        doc.y,
        { width: contentWidth, align: "center" },
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
