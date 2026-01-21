import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { logDesignProjectAudit } from "@/lib/design-project-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_VARIANTS = 4;

const toNumberSafe = (value: any, fallback = 1) => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const num = Number(raw);
  return isFinite(num) ? num : fallback;
};

const watermarkSvg = (width: number, height: number, text: string) => {
  const size = Math.max(48, Math.round(Math.min(width, height) * 0.22));
  const x = Math.round(width / 2);
  const y = Math.round(height / 2);
  return `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        .wm { fill: rgba(185, 28, 28, 0.12); font-size: ${size}px; font-family: Arial, sans-serif; font-weight: 700; letter-spacing: 6px; }
      </style>
    </defs>
    <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="wm" transform="rotate(-20 ${x} ${y})">
      ${text}
    </text>
  </svg>`;
};

async function applyWatermark(buffer: Buffer, text: string) {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const width = meta.width || 1024;
  const height = meta.height || 1024;
  const svg = watermarkSvg(width, height, text);
  return image
    .composite([{ input: Buffer.from(svg), gravity: "center" }])
    .png()
    .toBuffer();
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.designProject.findUnique({
    where: { id: params.id },
    select: { id: true, architectId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "ARCHITECTO" && project.architectId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const prompt = String(formData.get("prompt") || "").trim();
  const file = formData.get("image") as File | null;
  const variantsRaw = toNumberSafe(formData.get("variants"), 1);
  const variants = Math.min(Math.max(1, Math.round(variantsRaw)), MAX_VARIANTS);

  if (!prompt) {
    return NextResponse.json({ error: "Prompt requerido" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "Imagen requerida" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Formato de imagen no valido" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const sourcePath = `design-renders/${params.id}/source_${Date.now()}_${file.name || "render"}`;
  const sourceUpload = await put(sourcePath, inputBuffer, {
    access: "public",
    contentType: file.type || "image/png",
  });

  const fd = new FormData();
  fd.append("model", "gpt-image-1");
  fd.append("prompt", prompt);
  fd.append("n", String(variants));
  fd.append("size", "1024x1024");
  fd.append("response_format", "b64_json");
  fd.append("image", new Blob([inputBuffer], { type: file.type || "image/png" }), "render.png");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || "Error generando imagen";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const data = await response.json();
  const outputs = Array.isArray(data?.data) ? data.data : [];
  if (!outputs.length) {
    return NextResponse.json({ error: "Sin resultados" }, { status: 500 });
  }

  const saved: Array<{ outputImageUrl: string }> = [];
  const records: Array<any> = [];
  for (let i = 0; i < outputs.length; i += 1) {
    const b64 = outputs[i]?.b64_json;
    if (!b64) continue;
    const rawBuf = Buffer.from(String(b64), "base64");
    const watermarked = await applyWatermark(rawBuf, "TRENDS172");
    const outPath = `design-renders/${params.id}/render_${Date.now()}_${i + 1}.png`;
    const upload = await put(outPath, watermarked, {
      access: "public",
      contentType: "image/png",
    });
    saved.push({ outputImageUrl: upload.url });
    records.push({
      projectId: params.id,
      prompt,
      sourceImageUrl: sourceUpload.url,
      outputImageUrl: upload.url,
      createdById: userId,
    });
  }

  if (records.length) {
    await prisma.designProjectRender.createMany({ data: records });
    await logDesignProjectAudit({
      projectId: params.id,
      userId,
      action: "DESIGN_PROJECT_FILE_UPLOADED",
      details: `type:render;count:${records.length};source:${sourceUpload.url}`,
    });
  }

  return NextResponse.json({ images: saved }, { status: 201 });
}
