import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

const ALLOWED_SKP_MIMES = new Set([
  "application/octet-stream",
  "application/x-sketchup",
  "application/vnd.sketchup.skp",
  "model/vnd.sketchup.skp",
  "model/x-sketchup",
]);

const getTempRoot = () =>
  process.env.MODEL3D_TEMP_DIR || path.join(process.cwd(), "data", "skp-temp");

export async function POST(req: Request) {
  let savedPath: string | null = null;

  try {
    const session = await getServerSession(authOptions as any);
    const role = String((session?.user as any)?.role || "");
    const email = String((session?.user as any)?.email || "").toLowerCase();
    const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
    const isRoot = role === "ADMIN" && email === rootEmail;
    if (!session || !isRoot) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const form = await req.formData();
    const productId = String(form.get("productId") || "").trim();
    const file: any = form.get("file");

    if (!productId) {
      return NextResponse.json({ ok: false, error: "productId required" }, { status: 400 });
    }

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
    }

    const product = await prisma.product.findFirst({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ ok: false, error: "product not found" }, { status: 404 });
    }

    const originalFileName = String(file.name || "upload.skp");
    const nameLower = originalFileName.toLowerCase();
    if (!nameLower.endsWith(".skp")) {
      return NextResponse.json({ ok: false, error: "invalid file extension" }, { status: 415 });
    }

    const mime = String(file.type || "application/octet-stream").toLowerCase();
    if (!ALLOWED_SKP_MIMES.has(mime)) {
      return NextResponse.json({ ok: false, error: "invalid mime type" }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempRoot = getTempRoot();
    const targetDir = path.join(tempRoot, productId);
    await fs.mkdir(targetDir, { recursive: true });

    const fileId = randomUUID();
    const tempPath = path.join(targetDir, `${fileId}.skp`);
    await fs.writeFile(tempPath, buffer);
    savedPath = tempPath;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await (tx as any).model3DAsset.findFirst({
        where: { productId, archived: false },
      });

      let asset: any;
      if (existing && existing.status === "ERROR") {
        asset = await (tx as any).model3DAsset.update({
          where: { id: existing.id },
          data: {
            status: "PENDING",
            originalFileName,
            originalFileMime: mime,
            originalFileTempPath: tempPath,
            glbPath: null,
            previewImagePath: null,
            processingError: null,
            archived: false,
          },
        });
      } else {
        if (existing) {
          await (tx as any).model3DAsset.update({
            where: { id: existing.id },
            data: { archived: true },
          });
        }
        asset = await (tx as any).model3DAsset.create({
          data: {
            productId,
            status: "PENDING",
            originalFileName,
            originalFileMime: mime,
            originalFileTempPath: tempPath,
            glbPath: null,
            previewImagePath: null,
            processingError: null,
            archived: false,
          },
        });
      }

      const job = await (tx as any).model3DJob.create({
        data: {
          model3dAssetId: asset.id,
          status: "PENDING",
          attempts: 0,
        },
      });

      return { asset, job };
    });

    return NextResponse.json({
      ok: true,
      model3dAssetId: result.asset.id,
      jobId: result.job.id,
      status: result.job.status,
    });
  } catch (err) {
    if (savedPath) {
      try {
        await fs.unlink(savedPath);
      } catch {}
    }
    return NextResponse.json({ ok: false, error: "upload failed" }, { status: 500 });
  }
}
