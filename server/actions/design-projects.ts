"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DesignProjectStage, DesignProjectStatus } from "@prisma/client";

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
  const project = await prisma.designProject.findUnique({
    where: { id },
    include: {
      architect: { select: { id: true, name: true, email: true } },
      tasks: {
        include: { assignedTo: { select: { id: true, name: true, email: true } } },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      },
      updates: {
        include: { createdBy: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
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
  const architectIdRaw = String(formData.get("architectId") || "").trim();
  const architectId = architectIdRaw ? architectIdRaw : null;
  const description = String(formData.get("description") || "").trim() || null;
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
        architectId,
        description,
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
  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/dashboard/admin/estudio?error=Proyecto%20no%20encontrado");
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
  const architectIdRaw = String(formData.get("architectId") || "").trim();
  const architectId = architectIdRaw ? architectIdRaw : null;
  const description = String(formData.get("description") || "").trim() || null;
  try {
    await prisma.designProject.update({
      where: { id },
      data: {
        name,
        clientName,
        location,
        priority,
        status: status as DesignProjectStatus,
        stage: (stage || DesignProjectStage.BRIEFING) as DesignProjectStage,
        startDate,
        dueDate,
        architectId,
        description,
      },
    });
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
    select: { architectId: true },
  });
  if (!project) throw new Error("Not found");
  if (role === "ARCHITECTO" && project.architectId !== userId) {
    throw new Error("Not authorized");
  }
  await prisma.designProject.update({
    where: { id },
    data: { status: status as DesignProjectStatus },
  });
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
    select: { architectId: true },
  });
  if (!project) throw new Error("Not found");
  if (role === "ARCHITECTO" && project.architectId !== userId) {
    throw new Error("Not authorized");
  }
  await prisma.designProject.update({
    where: { id },
    data: { stage: stage as DesignProjectStage },
  });
  revalidatePath("/dashboard/admin/estudio");
  revalidatePath("/dashboard/arquitecto/estudio");
  redirect(`/dashboard/${role === "ADMIN" ? "admin" : "arquitecto"}/estudio/${id}`);
}
