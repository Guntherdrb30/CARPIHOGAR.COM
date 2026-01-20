"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DesignTaskStatus } from "@prisma/client";

const STATUS_VALUES = Object.values(DesignTaskStatus);

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
  return STATUS_VALUES.includes(raw as DesignTaskStatus)
    ? (raw as DesignTaskStatus)
    : null;
}

export async function createDesignProjectTaskAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") throw new Error("Not authorized");
  const projectId = String(formData.get("projectId") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const assignedToId = String(formData.get("assignedToId") || "").trim() || null;
  const priority = parsePriority(formData.get("priority"));
  const status = normalizeStatus(formData.get("status"));
  if (!projectId || !title || priority == null || !status) {
    redirect(`/dashboard/admin/estudio/${projectId}?error=Completa%20los%20campos%20requeridos`);
  }
  const dueDate = parseDate(formData.get("dueDate"));
  const comments = String(formData.get("comments") || "").trim() || null;
  try {
    await prisma.designProjectTask.create({
      data: {
        projectId,
        title,
        assignedToId,
        dueDate,
        priority,
        status: status as DesignTaskStatus,
        comments,
        createdById: String((session?.user as any)?.id || "") || null,
      },
    });
    revalidatePath(`/dashboard/admin/estudio/${projectId}`);
    revalidatePath(`/dashboard/arquitecto/estudio/${projectId}`);
    redirect(`/dashboard/admin/estudio/${projectId}?message=Tarea%20creada`);
  } catch {
    redirect(`/dashboard/admin/estudio/${projectId}?error=No%20se%20pudo%20crear%20la%20tarea`);
  }
}

export async function updateDesignProjectTaskAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    throw new Error("Not authorized");
  }
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Missing id");
  const task = await prisma.designProjectTask.findUnique({
    where: { id },
    include: { project: { select: { architectId: true } } },
  });
  if (!task) throw new Error("Not found");
  if (role === "ARCHITECTO") {
    if (task.project?.architectId !== userId) throw new Error("Not authorized");
    if (task.assignedToId && task.assignedToId !== userId) throw new Error("Not authorized");
    const status = normalizeStatus(formData.get("status"));
    const comments = String(formData.get("comments") || "").trim() || null;
    if (!status) throw new Error("Invalid status");
    await prisma.designProjectTask.update({
      where: { id },
      data: {
        status: status as DesignTaskStatus,
        comments,
      },
    });
  } else {
    const title = String(formData.get("title") || "").trim();
    const assignedToId = String(formData.get("assignedToId") || "").trim() || null;
    const priority = parsePriority(formData.get("priority"));
    const status = normalizeStatus(formData.get("status"));
    if (!title || priority == null || !status) {
      redirect(`/dashboard/admin/estudio/${task.projectId}?error=Completa%20los%20campos%20requeridos`);
    }
    const dueDate = parseDate(formData.get("dueDate"));
    const comments = String(formData.get("comments") || "").trim() || null;
    await prisma.designProjectTask.update({
      where: { id },
      data: {
        title,
        assignedToId,
        dueDate,
        priority,
        status: status as DesignTaskStatus,
        comments,
      },
    });
  }
  revalidatePath(`/dashboard/admin/estudio/${task.projectId}`);
  revalidatePath(`/dashboard/arquitecto/estudio/${task.projectId}`);
  redirect(`/dashboard/${role === "ADMIN" ? "admin" : "arquitecto"}/estudio/${task.projectId}`);
}
