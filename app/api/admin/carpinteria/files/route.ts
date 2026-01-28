import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({} as any));
    const projectId = String(body?.projectId || "").trim();
    const url = String(body?.url || "").trim();
    const filename = String(body?.filename || "").trim() || null;
    const fileTypeRaw = String(body?.fileType || "OTRO").toUpperCase();
    if (!projectId || !url) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const allowedTypes = new Set([
      "PLANO",
      "IMAGEN",
      "CONTRATO",
      "PRESUPUESTO",
      "AVANCE",
      "SOPORTE",
      "OTRO",
    ]);
    if (!allowedTypes.has(fileTypeRaw)) {
      return NextResponse.json({ error: "Tipo de archivo invalido" }, { status: 400 });
    }
    const fileType = fileTypeRaw as
      | "PLANO"
      | "IMAGEN"
      | "CONTRATO"
      | "PRESUPUESTO"
      | "AVANCE"
      | "SOPORTE"
      | "OTRO";
    const maxByType: Record<string, number | null> = {
      PRESUPUESTO: 1,
      PLANO: 2,
      CONTRATO: 1,
      IMAGEN: null,
      AVANCE: null,
      SOPORTE: null,
      OTRO: null,
    };
    const max = maxByType[fileType];
    if (typeof max === "number") {
      const count = await prisma.carpentryProjectFile.count({
        where: { projectId, fileType: fileType as any },
      });
      if (count >= max) {
        return NextResponse.json({ error: "Limite de archivos alcanzado" }, { status: 400 });
      }
    }
    const description = String(body?.description || "").trim() || null;
    const file = await prisma.carpentryProjectFile.create({
      data: { projectId, url, filename, fileType, description },
    });
    return NextResponse.json({ ok: true, file });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
