"use server";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DesignProjectStatus } from "@prisma/client";

const STATUS_VALUES = Object.values(DesignProjectStatus);

function parseStatus(value: any) {
  const raw = String(value || "").trim().toUpperCase();
  return STATUS_VALUES.includes(raw as DesignProjectStatus)
    ? (raw as DesignProjectStatus)
    : null;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const project = await prisma.designProject.findUnique({
    where: { id: params.id },
    include: { architect: { select: { id: true, name: true, email: true } } },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "ARCHITECTO" && project.architectId !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  return NextResponse.json({ project });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const payload: any = {};

  if (body?.name) payload.name = String(body.name).trim();
  if (body?.clientName) payload.clientName = String(body.clientName).trim();
  if (body?.location) payload.location = String(body.location).trim();
  if (body?.priority != null) {
    const priority = Number(body.priority);
    if (!Number.isFinite(priority) || priority < 1 || priority > 9) {
      return NextResponse.json({ error: "Priority out of range" }, { status: 400 });
    }
    payload.priority = Math.round(priority);
  }
  if (body?.status) {
    const status = parseStatus(body.status);
    if (!status) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    payload.status = status;
  }
  if (body?.startDate !== undefined) {
    const dt = body.startDate ? new Date(body.startDate) : null;
    payload.startDate = dt && !Number.isNaN(dt.getTime()) ? dt : null;
  }
  if (body?.dueDate !== undefined) {
    const dt = body.dueDate ? new Date(body.dueDate) : null;
    payload.dueDate = dt && !Number.isNaN(dt.getTime()) ? dt : null;
  }
  if (body?.architectId !== undefined) {
    const architectId = String(body.architectId || "").trim();
    payload.architectId = architectId || null;
  }
  if (body?.description !== undefined) {
    const description = String(body.description || "").trim();
    payload.description = description || null;
  }

  const project = await prisma.designProject.update({
    where: { id: params.id },
    data: payload,
  });
  return NextResponse.json({ project });
}
