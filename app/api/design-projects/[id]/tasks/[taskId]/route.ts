"use server";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DesignTaskStatus } from "@prisma/client";

const STATUS_VALUES = Object.values(DesignTaskStatus);

function parseStatus(value: any) {
  const raw = String(value || "").trim().toUpperCase();
  return STATUS_VALUES.includes(raw as DesignTaskStatus)
    ? (raw as DesignTaskStatus)
    : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; taskId: string } },
) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const task = await prisma.designProjectTask.findUnique({
    where: { id: params.taskId },
    include: { project: { select: { architectId: true } } },
  });
  if (!task || task.projectId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (role === "ARCHITECTO") {
    if (task.project?.architectId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (task.assignedToId && task.assignedToId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const payload: any = {};

  if (role === "ADMIN") {
    if (body?.title) payload.title = String(body.title).trim();
    if (body?.assignedToId !== undefined) {
      const assignedToId = String(body.assignedToId || "").trim();
      payload.assignedToId = assignedToId || null;
    }
    if (body?.dueDate !== undefined) {
      const dt = body.dueDate ? new Date(body.dueDate) : null;
      payload.dueDate = dt && !Number.isNaN(dt.getTime()) ? dt : null;
    }
    if (body?.priority !== undefined) {
      const priority = Number(body.priority);
      if (!Number.isFinite(priority) || priority < 1 || priority > 9) {
        return NextResponse.json({ error: "Priority out of range" }, { status: 400 });
      }
      payload.priority = Math.round(priority);
    }
  }

  if (body?.status) {
    const status = parseStatus(body.status);
    if (!status) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    payload.status = status;
  }
  if (body?.comments !== undefined) {
    payload.comments = String(body.comments || "").trim() || null;
  }

  const updated = await prisma.designProjectTask.update({
    where: { id: params.taskId },
    data: payload,
  });
  return NextResponse.json({ task: updated });
}
