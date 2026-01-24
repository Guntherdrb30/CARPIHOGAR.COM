"use server";

import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

function requireAdmin(session: any) {
  const role = String(session?.user?.role || "");
  if (role !== "ADMIN") throw new Error("Not authorized");
}

const toDecimal = (value: FormDataEntryValue | null, fallback = 0) => {
  const n = Number(String(value || "").trim());
  return Number.isFinite(n) ? n : fallback;
};

export async function getCarpentryProjects() {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  return prisma.carpentryProject.findMany({
    include: { files: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCarpentryTasks() {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  return prisma.carpentryTask.findMany({
    include: { employee: true, project: true },
    orderBy: { workDate: "desc" },
    take: 200,
  });
}

export async function createCarpentryProject(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const name = String(formData.get("name") || "").trim();
  const clientName = String(formData.get("clientName") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const totalAmountUSD = toDecimal(formData.get("totalAmountUSD"), 0);
  const status = String(formData.get("status") || "ACTIVO").toUpperCase();
  const startDateRaw = String(formData.get("startDate") || "").trim();
  const endDateRaw = String(formData.get("endDate") || "").trim();
  if (!name || !totalAmountUSD || totalAmountUSD <= 0) {
    redirect("/dashboard/admin/carpinteria?error=Nombre%20y%20monto%20requeridos");
  }
  await prisma.carpentryProject.create({
    data: {
      name,
      clientName,
      description,
      totalAmountUSD: totalAmountUSD as any,
      status:
        status === "EN_PROCESO"
          ? "EN_PROCESO"
          : status === "CERRADO"
          ? "CERRADO"
          : "ACTIVO",
      startDate: startDateRaw ? new Date(startDateRaw) : null,
      endDate: endDateRaw ? new Date(endDateRaw) : null,
    },
  });
  redirect("/dashboard/admin/carpinteria?message=Proyecto%20creado");
}

export async function updateCarpentryProject(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Missing id");
  const name = String(formData.get("name") || "").trim();
  const clientName = String(formData.get("clientName") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const totalAmountUSD = toDecimal(formData.get("totalAmountUSD"), 0);
  const status = String(formData.get("status") || "").toUpperCase();
  const startDateRaw = String(formData.get("startDate") || "").trim();
  const endDateRaw = String(formData.get("endDate") || "").trim();
  await prisma.carpentryProject.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      clientName,
      description,
      ...(totalAmountUSD ? { totalAmountUSD: totalAmountUSD as any } : {}),
      ...(status
        ? {
            status:
              status === "EN_PROCESO"
                ? "EN_PROCESO"
                : status === "CERRADO"
                ? "CERRADO"
                : "ACTIVO",
          }
        : {}),
      startDate: startDateRaw ? new Date(startDateRaw) : null,
      endDate: endDateRaw ? new Date(endDateRaw) : null,
    },
  });
  redirect("/dashboard/admin/carpinteria?message=Proyecto%20actualizado");
}

export async function deleteCarpentryProject(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Missing id");
  await prisma.carpentryProject.delete({ where: { id } });
  redirect("/dashboard/admin/carpinteria?message=Proyecto%20eliminado");
}

export async function addCarpentryProjectFile(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const projectId = String(formData.get("projectId") || "").trim();
  const url = String(formData.get("fileUrl") || "").trim();
  const filename = String(formData.get("filename") || "").trim() || null;
  const fileType = String(formData.get("fileType") || "OTRO").toUpperCase();
  if (!projectId || !url) {
    redirect("/dashboard/admin/carpinteria?error=Archivo%20invalido");
  }
  await prisma.carpentryProjectFile.create({
    data: {
      projectId,
      url,
      filename,
      fileType:
        fileType === "PLANO"
          ? "PLANO"
          : fileType === "IMAGEN"
          ? "IMAGEN"
          : "OTRO",
    },
  });
  redirect("/dashboard/admin/carpinteria?message=Archivo%20agregado");
}

export async function createCarpentryTask(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const employeeId = String(formData.get("employeeId") || "").trim();
  const projectId = String(formData.get("projectId") || "").trim() || null;
  const description = String(formData.get("description") || "").trim();
  const amountUSD = toDecimal(formData.get("amountUSD"), 0);
  const workDateRaw = String(formData.get("workDate") || "").trim();
  const phaseRaw = String(formData.get("phase") || "").toUpperCase();
  const phase =
    phaseRaw === "FABRICACION"
      ? "FABRICACION"
      : phaseRaw === "INSTALACION"
      ? "INSTALACION"
      : null;

  if (!employeeId || !description || !amountUSD || amountUSD <= 0) {
    redirect("/dashboard/admin/nomina?error=Datos%20incompletos");
  }

  try {
    await prisma.$transaction(async (tx) => {
      let project = null as any;
      if (projectId) {
        project = await tx.carpentryProject.findUnique({ where: { id: projectId } });
        if (!project) throw new Error("Proyecto no encontrado");
        if (!phase) throw new Error("Fase requerida");
        const total = Number(project.totalAmountUSD || 0);
        const fabPct = Number(project.fabricationPct || 70);
        const instPct = Number(project.installationPct || 30);
        const fabBudget = (total * fabPct) / 100;
        const instBudget = (total * instPct) / 100;
        const fabPaid = Number(project.fabricationPaidUSD || 0);
        const instPaid = Number(project.installationPaidUSD || 0);
        if (phase === "FABRICACION" && fabPaid + amountUSD > fabBudget + 0.01) {
          throw new Error("Pago excede el 70% de fabricacion");
        }
        if (phase === "INSTALACION" && instPaid + amountUSD > instBudget + 0.01) {
          throw new Error("Pago excede el 30% de instalacion");
        }
        await tx.carpentryProject.update({
          where: { id: project.id },
          data:
            phase === "FABRICACION"
              ? { fabricationPaidUSD: (fabPaid + amountUSD) as any }
              : { installationPaidUSD: (instPaid + amountUSD) as any },
        });
      }

      await tx.carpentryTask.create({
        data: {
          employeeId,
          projectId,
          description,
          amountUSD: amountUSD as any,
          workDate: workDateRaw ? new Date(workDateRaw) : new Date(),
          phase: phase as any,
        },
      });

      await tx.payrollPayment.create({
        data: {
          employeeId,
          category: "CARPINTERIA",
          amountUSD: amountUSD as any,
          paidAt: workDateRaw ? new Date(workDateRaw) : new Date(),
          description,
          service: "Carpinteria",
          projectId,
          projectPhase: phase as any,
        },
      });
    });
  } catch (err: any) {
    const msg = encodeURIComponent(String(err?.message || "No se pudo registrar el pago"));
    redirect(`/dashboard/admin/nomina?error=${msg}`);
  }

  redirect("/dashboard/admin/nomina?message=Pago%20carpintero%20registrado");
}
