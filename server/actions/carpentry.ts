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
    include: {
      files: true,
      carpenter: true,
      architect: true,
      supervisor: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCarpentryProjectById(id: string) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  return prisma.carpentryProject.findUnique({
    where: { id },
    include: {
      files: true,
      tasks: { include: { employee: true }, orderBy: { workDate: "desc" } },
      clientPayments: { orderBy: { paidAt: "desc" } },
      carpenter: true,
      architect: true,
      supervisor: true,
    },
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
  const clientEmail = String(formData.get("clientEmail") || "").trim() || null;
  const clientPhone = String(formData.get("clientPhone") || "").trim() || null;
  const clientAddress = String(formData.get("clientAddress") || "").trim() || null;
  const clientCity = String(formData.get("clientCity") || "").trim() || null;
  const clientState = String(formData.get("clientState") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const totalAmountUSD = toDecimal(formData.get("totalAmountUSD"), 0);
  const initialPaymentUSD = toDecimal(formData.get("initialPaymentUSD"), 0);
  const initialPaymentMethodRaw = String(formData.get("initialPaymentMethod") || "").toUpperCase();
  const initialPaymentReference = String(formData.get("initialPaymentReference") || "").trim() || null;
  const initialPaymentNotes = String(formData.get("initialPaymentNotes") || "").trim() || null;
  const initialPaymentPaidAtRaw = String(formData.get("initialPaymentPaidAt") || "").trim();
  const initialPaymentProofUrl = String(formData.get("initialPaymentProofUrl") || "").trim() || null;
  const laborCostUSD = toDecimal(formData.get("laborCostUSD"), 0);
  const status = String(formData.get("status") || "ACTIVO").toUpperCase();
  const startDateRaw = String(formData.get("startDate") || "").trim();
  const endDateRaw = String(formData.get("endDate") || "").trim();
  const carpenterId = String(formData.get("carpenterId") || "").trim() || null;
  const architectId = String(formData.get("architectId") || "").trim() || null;
  const supervisorId = String(formData.get("supervisorId") || "").trim() || null;
  if (!name || !totalAmountUSD || totalAmountUSD <= 0) {
    redirect("/dashboard/admin/carpinteria?error=Nombre%20y%20monto%20requeridos");
  }
  const initialPaymentMethod =
    initialPaymentMethodRaw === "PAGO_MOVIL"
      ? "PAGO_MOVIL"
      : initialPaymentMethodRaw === "TRANSFERENCIA"
      ? "TRANSFERENCIA"
      : initialPaymentMethodRaw === "ZELLE"
      ? "ZELLE"
      : initialPaymentMethodRaw === "EFECTIVO"
      ? "EFECTIVO"
      : null;
  await prisma.$transaction(async (tx) => {
    const project = await tx.carpentryProject.create({
      data: {
        name,
        clientName,
        clientEmail,
        clientPhone,
        clientAddress,
        clientCity,
        clientState,
        description,
        totalAmountUSD: totalAmountUSD as any,
        initialPaymentUSD: initialPaymentUSD ? (initialPaymentUSD as any) : null,
        laborCostUSD: laborCostUSD ? (laborCostUSD as any) : null,
        status:
          status === "EN_PROCESO"
            ? "EN_PROCESO"
            : status === "CERRADO"
            ? "CERRADO"
            : "ACTIVO",
        startDate: startDateRaw ? new Date(startDateRaw) : null,
        endDate: endDateRaw ? new Date(endDateRaw) : null,
        carpenterId,
        architectId,
        supervisorId,
      },
    });
    if (initialPaymentUSD > 0) {
      await tx.carpentryClientPayment.create({
        data: {
          projectId: project.id,
          amountUSD: initialPaymentUSD as any,
          paidAt: initialPaymentPaidAtRaw ? new Date(initialPaymentPaidAtRaw) : new Date(),
          method: initialPaymentMethod as any,
          reference: initialPaymentReference,
          notes: initialPaymentNotes,
          proofUrl: initialPaymentProofUrl,
        },
      });
    }
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
  const clientEmail = String(formData.get("clientEmail") || "").trim() || null;
  const clientPhone = String(formData.get("clientPhone") || "").trim() || null;
  const clientAddress = String(formData.get("clientAddress") || "").trim() || null;
  const clientCity = String(formData.get("clientCity") || "").trim() || null;
  const clientState = String(formData.get("clientState") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const totalAmountUSD = toDecimal(formData.get("totalAmountUSD"), 0);
  const initialPaymentUSD = toDecimal(formData.get("initialPaymentUSD"), 0);
  const laborCostUSD = toDecimal(formData.get("laborCostUSD"), 0);
  const status = String(formData.get("status") || "").toUpperCase();
  const startDateRaw = String(formData.get("startDate") || "").trim();
  const endDateRaw = String(formData.get("endDate") || "").trim();
  const carpenterId = String(formData.get("carpenterId") || "").trim() || null;
  const architectId = String(formData.get("architectId") || "").trim() || null;
  const supervisorId = String(formData.get("supervisorId") || "").trim() || null;
  await prisma.carpentryProject.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      clientCity,
      clientState,
      description,
      ...(totalAmountUSD ? { totalAmountUSD: totalAmountUSD as any } : {}),
      ...(initialPaymentUSD ? { initialPaymentUSD: initialPaymentUSD as any } : {}),
      ...(laborCostUSD ? { laborCostUSD: laborCostUSD as any } : {}),
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
      carpenterId,
      architectId,
      supervisorId,
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
          : fileType === "CONTRATO"
          ? "CONTRATO"
          : fileType === "PRESUPUESTO"
          ? "PRESUPUESTO"
          : fileType === "AVANCE"
          ? "AVANCE"
          : "OTRO",
    },
  });
  redirect("/dashboard/admin/carpinteria?message=Archivo%20agregado");
}

export async function createCarpentryClientPayment(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const projectId = String(formData.get("projectId") || "").trim();
  const amountUSD = toDecimal(formData.get("amountUSD"), 0);
  const paidAtRaw = String(formData.get("paidAt") || "").trim();
  const methodRaw = String(formData.get("method") || "").toUpperCase();
  const reference = String(formData.get("reference") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const proofUrl = String(formData.get("proofUrl") || "").trim() || null;
  if (!projectId || !amountUSD || amountUSD <= 0) {
    redirect("/dashboard/admin/carpinteria?error=Pago%20invalido");
  }
  const method =
    methodRaw === "PAGO_MOVIL"
      ? "PAGO_MOVIL"
      : methodRaw === "TRANSFERENCIA"
      ? "TRANSFERENCIA"
      : methodRaw === "ZELLE"
      ? "ZELLE"
      : methodRaw === "EFECTIVO"
      ? "EFECTIVO"
      : null;
  await prisma.carpentryClientPayment.create({
    data: {
      projectId,
      amountUSD: amountUSD as any,
      paidAt: paidAtRaw ? new Date(paidAtRaw) : new Date(),
      method: method as any,
      reference,
      notes,
      proofUrl,
    },
  });
  redirect(`/dashboard/admin/carpinteria/${projectId}?message=Abono%20registrado`);
}

export async function updateCarpentryTaskStatus(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const id = String(formData.get("id") || "").trim();
  const statusRaw = String(formData.get("status") || "").toUpperCase();
  const status =
    statusRaw === "EN_PROGRESO"
      ? "EN_PROGRESO"
      : statusRaw === "COMPLETADA"
      ? "COMPLETADA"
      : "PENDIENTE";
  await prisma.carpentryTask.update({
    where: { id },
    data: { status: status as any },
  });
  const backTo = String(formData.get("backTo") || "").trim();
  redirect(backTo || "/dashboard/admin/carpinteria");
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
  const statusRaw = String(formData.get("status") || "").toUpperCase();
  const status =
    statusRaw === "EN_PROGRESO"
      ? "EN_PROGRESO"
      : statusRaw === "COMPLETADA"
      ? "COMPLETADA"
      : "PENDIENTE";
  const methodRaw = String(formData.get("method") || "").toUpperCase();
  const reference = String(formData.get("reference") || "").trim() || null;
  const backTo = String(formData.get("backTo") || "").trim();

  if (!employeeId || !description) {
    redirect(`${backTo || "/dashboard/admin/nomina"}?error=Datos%20incompletos`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      let project = null as any;
      if (projectId && amountUSD > 0) {
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
          status: status as any,
        },
      });

      if (amountUSD > 0) {
        const method =
          methodRaw === "PAGO_MOVIL"
            ? "PAGO_MOVIL"
            : methodRaw === "TRANSFERENCIA"
            ? "TRANSFERENCIA"
            : methodRaw === "ZELLE"
            ? "ZELLE"
            : methodRaw === "EFECTIVO"
            ? "EFECTIVO"
            : null;
        await tx.payrollPayment.create({
          data: {
            employeeId,
            category: "CARPINTERIA",
            amountUSD: amountUSD as any,
            paidAt: workDateRaw ? new Date(workDateRaw) : new Date(),
            method: method as any,
            reference,
            description,
            service: "Carpinteria",
            projectId,
            projectPhase: phase as any,
          },
        });
      }
    });
  } catch (err: any) {
    const msg = encodeURIComponent(String(err?.message || "No se pudo registrar el pago"));
    redirect(`${backTo || "/dashboard/admin/nomina"}?error=${msg}`);
  }

  redirect(`${backTo || "/dashboard/admin/nomina"}?message=Pago%20carpintero%20registrado`);
}
