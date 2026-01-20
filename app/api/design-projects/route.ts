"use server";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DesignProjectStage, DesignProjectStatus } from "@prisma/client";

const STATUS_VALUES = Object.values(DesignProjectStatus);
const STAGE_VALUES = Object.values(DesignProjectStage);

function parseStatus(value: any) {
  const raw = String(value || "").trim().toUpperCase();
  return STATUS_VALUES.includes(raw as DesignProjectStatus)
    ? (raw as DesignProjectStatus)
    : null;
}

function parseStage(value: any) {
  const raw = String(value || "").trim().toUpperCase();
  return STAGE_VALUES.includes(raw as DesignProjectStage)
    ? (raw as DesignProjectStage)
    : null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const where = role === "ARCHITECTO" ? { architectId: userId } : {};
  const projects = await prisma.designProject.findMany({
    where,
    include: { architect: { select: { id: true, name: true, email: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  const clientName = String(body?.clientName || "").trim();
  const location = String(body?.location || "").trim();
  const priority = Number(body?.priority);
  const status = parseStatus(body?.status);
  const stage = parseStage(body?.stage);
  if (!name || !clientName || !location || !Number.isFinite(priority) || !status) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (priority < 1 || priority > 9) {
    return NextResponse.json({ error: "Priority out of range" }, { status: 400 });
  }
  const startDate = body?.startDate ? new Date(body.startDate) : null;
  const dueDate = body?.dueDate ? new Date(body.dueDate) : null;
  const architectId = body?.architectId ? String(body.architectId) : null;
  const description = body?.description ? String(body.description) : null;

  const project = await prisma.designProject.create({
    data: {
      name,
      clientName,
      location,
      priority: Math.round(priority),
      status,
      stage: stage || DesignProjectStage.BRIEFING,
      startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      architectId,
      description,
      createdById: String((session?.user as any)?.id || "") || null,
    },
  });
  return NextResponse.json({ project }, { status: 201 });
}
