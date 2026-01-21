"use server";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logDesignProjectAudit } from "@/lib/design-project-audit";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const project = await prisma.designProject.findUnique({
    where: { id: params.id },
    select: { architectId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "ARCHITECTO" && project.architectId !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const updates = await prisma.designProjectUpdate.findMany({
    where: { projectId: params.id },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ updates });
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
    select: { architectId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "ARCHITECTO" && project.architectId !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const note = String(body?.note || "").trim();
  const fileUrl = String(body?.fileUrl || "").trim();
  if (!note && !fileUrl) {
    return NextResponse.json({ error: "Missing update" }, { status: 400 });
  }
  const update = await prisma.designProjectUpdate.create({
    data: {
      projectId: params.id,
      note: note || null,
      fileUrl: fileUrl || null,
      createdById: userId,
    },
  });
  if (fileUrl) {
    await logDesignProjectAudit({
      projectId: params.id,
      userId,
      action: "DESIGN_PROJECT_FILE_UPLOADED",
      details: `type:update;updateId:${update.id};file:${fileUrl}`,
    });
  }
  return NextResponse.json({ update }, { status: 201 });
}
