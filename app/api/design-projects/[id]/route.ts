"use server";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DesignProjectStage, DesignProjectStatus } from "@prisma/client";
import { logDesignProjectAudit } from "@/lib/design-project-audit";

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

function dateMs(value: Date | null | undefined) {
  if (!value) return null;
  const ms = value.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function formatAuditDate(value: Date | null | undefined) {
  if (!value) return "null";
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "invalid";
  }
}

function listAdded(prev: string[] | null | undefined, next: string[]) {
  const prevSet = new Set((prev || []).filter(Boolean));
  return next.filter((url) => url && !prevSet.has(url));
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
  const auditUserId = String((session?.user as any)?.id || "") || null;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const previous = await prisma.designProject.findUnique({
    where: { id: params.id },
    select: {
      startDate: true,
      dueDate: true,
      status: true,
      stage: true,
      referenceImages: true,
    },
  });
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
  if (body?.stage) {
    const stage = parseStage(body.stage);
    if (!stage) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    payload.stage = stage;
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
  if (body?.initialMeasurements !== undefined) {
    const initialMeasurements = String(body.initialMeasurements || "").trim();
    payload.initialMeasurements = initialMeasurements || null;
  }
  if (body?.referenceImages !== undefined) {
    const referenceImages = Array.isArray(body.referenceImages)
      ? body.referenceImages.map((url: any) => String(url || "").trim()).filter(Boolean)
      : [];
    payload.referenceImages = Array.from(new Set(referenceImages));
  }

  const project = await prisma.designProject.update({
    where: { id: params.id },
    data: payload,
  });
  if (previous) {
    const dateChanged =
      dateMs(previous.startDate) !== dateMs(project.startDate) ||
      dateMs(previous.dueDate) !== dateMs(project.dueDate);
    if (dateChanged) {
      await logDesignProjectAudit({
        projectId: params.id,
        userId: auditUserId,
        action: "DESIGN_PROJECT_DATES_CHANGE",
        details: `start:${formatAuditDate(previous.startDate)}->${formatAuditDate(project.startDate)};due:${formatAuditDate(previous.dueDate)}->${formatAuditDate(project.dueDate)}`,
      });
    }
    if (previous.status !== project.status) {
      await logDesignProjectAudit({
        projectId: params.id,
        userId: auditUserId,
        action: "DESIGN_PROJECT_STATUS_CHANGE",
        details: `from:${previous.status};to:${project.status}`,
      });
    }
    if (previous.stage !== project.stage) {
      await logDesignProjectAudit({
        projectId: params.id,
        userId: auditUserId,
        action: "DESIGN_PROJECT_STAGE_CHANGE",
        details: `from:${previous.stage};to:${project.stage}`,
      });
    }
    const addedImages = listAdded(previous.referenceImages, project.referenceImages || []);
    if (addedImages.length) {
      const sample = addedImages.slice(0, 3).join("|");
      await logDesignProjectAudit({
        projectId: params.id,
        userId: auditUserId,
        action: "DESIGN_PROJECT_FILE_UPLOADED",
        details: `type:reference_images;added:${addedImages.length};sample:${sample || "none"}`,
      });
    }
  }
  return NextResponse.json({ project });
}
