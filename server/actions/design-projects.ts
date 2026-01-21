"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DesignProjectStage, DesignProjectStatus } from "@prisma/client";
import { logDesignProjectAudit } from "@/lib/design-project-audit";

const STATUS_VALUES = Object.values(DesignProjectStatus);
const STAGE_VALUES = Object.values(DesignProjectStage);

function parsePriority(value: FormDataEntryValue | null) {
  const num = Number(String(value || "").trim());
  if (!Number.isFinite(num)) return null;
  if (num < 1 || num > 9) return null;
  return Math.round(num);
}

function parseDate(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const dt = new Date(`${raw}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseMoney(value: FormDataEntryValue | null) {
  const raw = String(value || "").replace(",", ".").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return num;
}

function normalizeStatus(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim().toUpperCase();
  return STATUS_VALUES.includes(raw as DesignProjectStatus)
    ? (raw as DesignProjectStatus)
    : null;
}

function normalizeStage(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim().toUpperCase();
  return STAGE_VALUES.includes(raw as DesignProjectStage)
    ? (raw as DesignProjectStage)
    : null;
}

function parseStringList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
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

function toMoneyString(value: any) {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(2) : null;
  }
  if (typeof value?.toNumber === "function") {
    const num = value.toNumber();
    return Number.isFinite(num) ? num.toFixed(2) : null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : null;
}

function listAdded(prev: string[] | null | undefined, next: string[]) {
  const prevSet = new Set((prev || []).filter(Boolean));
  return next.filter((url) => url && !prevSet.has(url));
}

export async function getArchitectUsers() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") throw new Error("Not authorized");
  return prisma.user.findMany({
    where: { role: "ARCHITECTO" as any },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

export async function getDesignProjectsForSession() {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || !role) throw new Error("Not authorized");
  if (role !== "ADMIN" && role !== "ARCHITECTO") throw new Error("Not authorized");
  const where =
    role === "ARCHITECTO"
      ? { architectId: userId }
      : {};
  return prisma.designProject.findMany({
    where,
    include: {
      architect: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
}

export async function getDesignProjectByIdForSession(id: string) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || !role) throw new Error("Not authorized");
  if (role !== "ADMIN" && role !== "ARCHITECTO") throw new Error("Not authorized");
  const include: any = {
    architect: { select: { id: true, name: true, email: true } },
    tasks: {
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    },
    updates: {
      include: { createdBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    },
    renders: {
      include: { createdBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    },
  };
  if (role === "ADMIN") {
    include.payments = {
      include: { createdBy: { select: { id: true, name: true, email: true } } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    };
  }
  const project = await prisma.designProject.findUnique({
    where: { id },
    include,
  });
  if (!project) return null;
  if (role === "ARCHITECTO" && project.architectId !== userId) {
    throw new Error("Not authorized");
  }
  return project;
}

export async function createDesignProjectAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") throw new Error("Not authorized");
  const name = String(formData.get("name") || "").trim();
  const clientName = String(formData.get("clientName") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const priority = parsePriority(formData.get("priority"));
  const status = normalizeStatus(formData.get("status"));
  const stage = normalizeStage(formData.get("stage"));
  if (!name || !clientName || !location || priority == null || !status) {
    redirect("/dashboard/admin/estudio?error=Completa%20los%20campos%20requeridos");
  }
  const startDate = parseDate(formData.get("startDate"));
  const dueDate = parseDate(formData.get("dueDate"));
  const designTotalUSD = parseMoney(formData.get("designTotalUSD"));
  const architectIdRaw = String(formData.get("architectId") || "").trim();
  const architectId = architectIdRaw ? architectIdRaw : null;
  const description = String(formData.get("description") || "").trim() || null;
  const initialMeasurements = String(formData.get("initialMeasurements") || "").trim() || null;
  const referenceImages = Array.from(new Set(parseStringList(formData, "referenceImages[]")));
  try {
    await prisma.designProject.create({
      data: {
        name,
        clientName,
        location,
        priority,
        status: status as DesignProjectStatus,
        stage: (stage || DesignProjectStage.BRIEFING) as DesignProjectStage,
        startDate,
        dueDate,
        designTotalUSD: designTotalUSD != null ? (designTotalUSD as any) : null,
        architectId,
        description,
        initialMeasurements,
        referenceImages,
        createdById: String((session?.user as any)?.id || "") || null,
      },
    });
    revalidatePath("/dashboard/admin/estudio");
    redirect("/dashboard/admin/estudio?message=Proyecto%20creado");
  } catch {
    redirect("/dashboard/admin/estudio?error=No%20se%20pudo%20crear%20el%20proyecto");
  }
}

export async function updateDesignProjectAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") throw new Error("Not authorized");
  const auditUserId = String((session?.user as any)?.id || "") || null;
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/dashboard/admin/estudio?error=Proyecto%20no%20encontrado");
  const previous = await prisma.designProject.findUnique({
    where: { id },
    select: {
      startDate: true,
      dueDate: true,
      status: true,
      stage: true,
      designTotalUSD: true,
      referenceImages: true,
    },
  });
  const name = String(formData.get("name") || "").trim();
  const clientName = String(formData.get("clientName") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const priority = parsePriority(formData.get("priority"));
  const status = normalizeStatus(formData.get("status"));
  const stage = normalizeStage(formData.get("stage"));
  if (!name || !clientName || !location || priority == null || !status) {
    redirect(`/dashboard/admin/estudio/${id}?error=Completa%20los%20campos%20requeridos`);
  }
  const startDate = parseDate(formData.get("startDate"));
  const dueDate = parseDate(formData.get("dueDate"));
  const designTotalUSD = parseMoney(formData.get("designTotalUSD"));
  const architectIdRaw = String(formData.get("architectId") || "").trim();
  const architectId = architectIdRaw ? architectIdRaw : null;
  const description = String(formData.get("description") || "").trim() || null;
  const initialMeasurements = String(formData.get("initialMeasurements") || "").trim() || null;
  const referenceImages = parseStringList(formData, "referenceImages[]");
  const removeImages = new Set(parseStringList(formData, "referenceImagesRemove[]"));
  const filteredImages = referenceImages.filter((url) => !removeImages.has(url));
  const uniqueImages = Array.from(new Set(filteredImages));
  const nextStatus = status as DesignProjectStatus;
  const nextStage = (stage || DesignProjectStage.BRIEFING) as DesignProjectStage;
  const nextMoney = toMoneyString(designTotalUSD);
  try {
    await prisma.designProject.update({
      where: { id },
      data: {
        name,
        clientName,
        location,
        priority,
        status: nextStatus,
        stage: nextStage,
        startDate,
        dueDate,
        designTotalUSD: designTotalUSD != null ? (designTotalUSD as any) : null,
        architectId,
        description,
        initialMeasurements,
        referenceImages: uniqueImages,
      },
    });
    if (previous) {
      const dateChanged =
        dateMs(previous.startDate) !== dateMs(startDate) ||
        dateMs(previous.dueDate) !== dateMs(dueDate);
      if (dateChanged) {
        await logDesignProjectAudit({
          projectId: id,
          userId: auditUserId,
          action: "DESIGN_PROJECT_DATES_CHANGE",
          details: `start:${formatAuditDate(previous.startDate)}->${formatAuditDate(startDate)};due:${formatAuditDate(previous.dueDate)}->${formatAuditDate(dueDate)}`,
        });
      }
      if (previous.status !== nextStatus) {
        await logDesignProjectAudit({
          projectId: id,
          userId: auditUserId,
          action: "DESIGN_PROJECT_STATUS_CHANGE",
          details: `from:${previous.status};to:${nextStatus}`,
        });
      }
      if (previous.stage !== nextStage) {
        await logDesignProjectAudit({
          projectId: id,
          userId: auditUserId,
          action: "DESIGN_PROJECT_STAGE_CHANGE",
          details: `from:${previous.stage};to:${nextStage}`,
        });
      }
      const prevMoney = toMoneyString(previous.designTotalUSD);
      if (prevMoney !== nextMoney) {
        await logDesignProjectAudit({
          projectId: id,
          userId: auditUserId,
          action: "DESIGN_PROJECT_FINANCIAL_CHANGE",
          details: `totalUSD:${prevMoney || "null"}->${nextMoney || "null"}`,
        });
      }
      const addedImages = listAdded(previous.referenceImages, uniqueImages);
      if (addedImages.length) {
        const sample = addedImages.slice(0, 3).join("|");
        await logDesignProjectAudit({
          projectId: id,
          userId: auditUserId,
          action: "DESIGN_PROJECT_FILE_UPLOADED",
          details: `type:reference_images;added:${addedImages.length};sample:${sample || "none"}`,
        });
      }
    }
    revalidatePath("/dashboard/admin/estudio");
    redirect(`/dashboard/admin/estudio/${id}?message=Proyecto%20actualizado`);
  } catch {
    redirect(`/dashboard/admin/estudio/${id}?error=No%20se%20pudo%20actualizar`);
  }
}

export async function updateDesignProjectStatusAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    throw new Error("Not authorized");
  }
  const id = String(formData.get("id") || "").trim();
  const status = normalizeStatus(formData.get("status"));
  if (!id || !status) throw new Error("Invalid input");
  const project = await prisma.designProject.findUnique({
    where: { id },
    select: { architectId: true, status: true },
  });
  if (!project) throw new Error("Not found");
  if (role === "ARCHITECTO" && project.architectId !== userId) {
    throw new Error("Not authorized");
  }
  await prisma.designProject.update({
    where: { id },
    data: { status: status as DesignProjectStatus },
  });
  if (project.status !== status) {
    await logDesignProjectAudit({
      projectId: id,
      userId,
      action: "DESIGN_PROJECT_STATUS_CHANGE",
      details: `from:${project.status};to:${status}`,
    });
  }
  revalidatePath("/dashboard/admin/estudio");
  revalidatePath("/dashboard/arquitecto/estudio");
  redirect(`/dashboard/${role === "ADMIN" ? "admin" : "arquitecto"}/estudio/${id}`);
}

export async function updateDesignProjectStageAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    throw new Error("Not authorized");
  }
  const id = String(formData.get("id") || "").trim();
  const stage = normalizeStage(formData.get("stage"));
  if (!id || !stage) throw new Error("Invalid input");
  const project = await prisma.designProject.findUnique({
    where: { id },
    select: { architectId: true, stage: true },
  });
  if (!project) throw new Error("Not found");
  if (role === "ARCHITECTO" && project.architectId !== userId) {
    throw new Error("Not authorized");
  }
  await prisma.designProject.update({
    where: { id },
    data: { stage: stage as DesignProjectStage },
  });
  if (project.stage !== stage) {
    await logDesignProjectAudit({
      projectId: id,
      userId,
      action: "DESIGN_PROJECT_STAGE_CHANGE",
      details: `from:${project.stage};to:${stage}`,
    });
  }
  revalidatePath("/dashboard/admin/estudio");
  revalidatePath("/dashboard/arquitecto/estudio");
  redirect(`/dashboard/${role === "ADMIN" ? "admin" : "arquitecto"}/estudio/${id}`);
}
