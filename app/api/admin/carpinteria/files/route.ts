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
    const fileType =
      fileTypeRaw === "PLANO"
        ? "PLANO"
        : fileTypeRaw === "IMAGEN"
        ? "IMAGEN"
        : "OTRO";
    const file = await prisma.carpentryProjectFile.create({
      data: { projectId, url, filename, fileType },
    });
    return NextResponse.json({ ok: true, file });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
