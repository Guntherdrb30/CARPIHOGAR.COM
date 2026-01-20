export type PdfHeaderOptions = {
  title: string;
  subtitle?: string;
  brandName?: string;
  brandColor?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoUrl?: string;
  accentColor?: string;
  baseUrl?: string;
};

export async function fetchLogoBuffer(logoUrl?: string, baseUrl?: string): Promise<Buffer | null> {
  try {
    if (!logoUrl) return null;
    const resolved = logoUrl.startsWith("http")
      ? logoUrl
      : baseUrl
      ? new URL(logoUrl, baseUrl).toString()
      : "";
    if (!resolved) return null;
    const res = await fetch(resolved);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

export function createPdfDoc(PDFDocument: any) {
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: any) => reject(err));
  });
  return { doc, done };
}

export function ensureSpace(doc: any, minHeight: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + minHeight > bottom) {
    doc.addPage();
  }
}

export function drawHeader(doc: any, opts: PdfHeaderOptions, logoBuf?: Buffer | null) {
  const brandName = opts.brandName || "Carpihogar.ai";
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const accent = opts.accentColor || "#111827";
  const brandColor = opts.brandColor || "#111827";
  const top = 24;

  doc.save();
  doc.strokeColor(accent).lineWidth(2).moveTo(left, top).lineTo(right, top).stroke();
  doc.restore();

  if (logoBuf) {
    try {
      doc.image(logoBuf, left, top + 6, { fit: [60, 40] });
    } catch {}
  }

  const titleX = logoBuf ? left + 70 : left;
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111");
  doc.text(opts.title, titleX, top + 6, { width: right - titleX });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(brandColor);
  doc.text(brandName, titleX, doc.y + 2);
  doc.font("Helvetica").fontSize(9).fillColor("#555");
  if (opts.subtitle) {
    doc.text(opts.subtitle, titleX, doc.y + 2);
  }
  const contact = [opts.contactEmail, opts.contactPhone].filter(Boolean).join("  ");
  if (contact) {
    doc.text(contact, titleX, doc.y + 2);
  }

  doc.moveDown(1.2);
}

export function sectionTitle(doc: any, title: string) {
  ensureSpace(doc, 26);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const y = doc.y + 4;
  doc.save();
  doc.fillColor("#f3f4f6").rect(left, y, width, 18).fill();
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111");
  doc.text(title, left + 8, y + 4);
  doc.y = y + 24;
}

export function renderTable(
  doc: any,
  columns: Array<{ label: string; width: number; align?: "left" | "right" | "center" }>,
  rows: Array<string[]>
) {
  const left = doc.page.margins.left;
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  ensureSpace(doc, 24);
  const headerY = doc.y;
  doc.save();
  doc.fillColor("#f3f4f6").rect(left, headerY - 2, tableWidth, 18).fill();
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#555");
  columns.forEach((col, idx) => {
    const offset = columns.slice(0, idx).reduce((sum, c) => sum + c.width, 0);
    doc.text(col.label, left + offset, headerY + 2, { width: col.width, align: col.align || "left" });
  });
  doc.y = headerY + 20;
  doc.moveTo(left, doc.y).lineTo(left + tableWidth, doc.y).strokeColor("#e5e7eb").stroke();
  doc.y += 4;

  let rowIndex = 0;
  for (const row of rows) {
    ensureSpace(doc, 16);
    const rowY = doc.y;
    if (rowIndex % 2 === 1) {
      doc.save();
      doc.fillColor("#fcfcfd").rect(left, rowY - 2, tableWidth, 14).fill();
      doc.restore();
    }
    doc.font("Helvetica").fontSize(9).fillColor("#111");
    columns.forEach((col, idx) => {
      const offset = columns.slice(0, idx).reduce((sum, c) => sum + c.width, 0);
      doc.text(row[idx] || "-", left + offset, rowY, { width: col.width, align: col.align || "left" });
    });
    doc.y = rowY + 14;
    rowIndex += 1;
  }
  doc.moveDown(0.5);
}
