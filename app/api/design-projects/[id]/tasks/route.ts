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
  const tasks = await prisma.designProjectTask.findMany({
    where: { projectId: params.id },
    include: { assignedTo: { select: { id: true, name: true, email: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const title = String(body?.title || "").trim();
  const assignedToId = body?.assignedToId ? String(body.assignedToId) : null;
  const priority = Number(body?.priority);
  const status = parseStatus(body?.status);
  if (!title || !Number.isFinite(priority) || priority < 1 || priority > 9 || !status) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const dueDate = body?.dueDate ? new Date(body.dueDate) : null;
  const comments = body?.comments ? String(body.comments) : null;
  const task = await prisma.designProjectTask.create({
    data: {
      projectId: params.id,
      title,
      assignedToId,
      priority: Math.round(priority),
      status,
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      comments,
      createdById: String((session?.user as any)?.id || "") || null,
    },
  });
  return NextResponse.json({ task }, { status: 201 });
}
