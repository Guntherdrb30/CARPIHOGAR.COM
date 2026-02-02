"use server";

import { Prisma } from "@prisma/client";
import type { CarpentryProjectPhase } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

function requireAdmin(session: any) {
  const role = String(session?.user?.role || "");
  if (role !== "ADMIN") throw new Error("Not authorized");
}

function requireProjectManager(session: any) {
  const role = String(session?.user?.role || "");
  if (role !== "ADMIN" && role !== "SUPERVISOR_PROYECTOS") throw new Error("Not authorized");
}

const toDecimal = (value: FormDataEntryValue | null, fallback = 0) => {
  const n = Number(String(value || "").trim());
  return Number.isFinite(n) ? n : fallback;
};
const parseDate = (value: string | null) => {
  const raw = String(value || "").trim();
  return raw ? new Date(raw) : null;
};
const parseBool = (value: string | null) => {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "on";
};

type UploadedProjectFile = {
  url: string;
  filename?: string | null;
  fileType?: string;
};

const ALLOWED_CARPENTRY_FILE_TYPES = new Set(["PLANO","IMAGEN","CONTRATO","PRESUPUESTO","AVANCE","OTRO"]);

function parseProjectFiles(formData: FormData, fieldName: string): UploadedProjectFile[] {
  const values = formData.getAll(fieldName);
  const files: UploadedProjectFile[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") continue;
    try {
      const parsed = JSON.parse(entry) as UploadedProjectFile;
      if (parsed?.url) {
        files.push(parsed);
      }
    } catch (_err) {
      // ignore invalid payload
    }
  }
  return files;
}

function normalizeProjectFileType(value?: string) {
  const normalized = String(value || "").toUpperCase();
  if (ALLOWED_CARPENTRY_FILE_TYPES.has(normalized)) {
    return normalized;
  }
  return "OTRO";
}

async function saveProjectFiles(
  tx: Prisma.TransactionClient,
  projectId: string,
  files: UploadedProjectFile[]
) {
  if (!files.length) return;
  await Promise.all(
    files.map((file) =>
      tx.carpentryProjectFile.create({
        data: {
          projectId,
          url: file.url,
          filename: file.filename,
          fileType: normalizeProjectFileType(file.fileType) as any,
        },
      })
    )
  );
}

async function createInventoryEntriesFromOrder(
  tx: Prisma.TransactionClient,
  projectId: string,
  purchaseOrderId: string,
  saleId: string | null
) {
  if (!saleId) return;
  const order = await tx.order.findUnique({
    where: { id: saleId },
    include: { items: true },
  });
  if (!order?.items?.length) return;
  for (const item of order.items) {
    const existing = await tx.carpentryProjectInventoryEntry.findUnique({
      where: { orderItemId: item.id },
    });
    if (existing) continue;
    await tx.carpentryProjectInventoryEntry.create({
      data: {
        projectId,
        purchaseOrderId,
        orderId: saleId,
        orderItemId: item.id,
        itemName: item.name,
        sku: null,
        productId: item.productId,
        quantity: item.quantity,
        remainingQuantity: item.quantity,
        unitPriceUSD: item.priceUSD as any,
      },
    });
  }
}

async function ensureInventoryEntriesForProject(projectId: string, purchaseOrders: { id: string; saleId: string | null }[]) {
  if (!purchaseOrders?.length) return;
  await prisma.$transaction(async (tx) => {
    for (const po of purchaseOrders) {
      await createInventoryEntriesFromOrder(tx, projectId, po.id, po.saleId);
    }
  });
}

export async function getCarpentryProjects() {
  const session = await getServerSession(authOptions);
  requireProjectManager(session);
  return prisma.carpentryProject.findMany({
    include: {
      files: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCarpentryProjectById(id: string) {
  const session = await getServerSession(authOptions);
  requireProjectManager(session);
  const project = await prisma.carpentryProject.findUnique({
    where: { id },
    include: {
      files: true,
      tasks: { include: { employee: true }, orderBy: { workDate: "desc" } },
      clientPayments: { orderBy: { paidAt: "desc" } },
      materialLists: {
        include: { items: true, deliveredBy: true },
        orderBy: { uploadedAt: "desc" },
      },
      purchaseOrders: { orderBy: { createdAt: "desc" } },
      expenses: { orderBy: { date: "desc" } },
      productionOrders: {
        include: { tasks: { orderBy: { workDate: "desc" } } },
        orderBy: { createdAt: "desc" },
      },
      updates: {
        include: { responsible: true, createdBy: true },
        orderBy: { progressDate: "desc" },
      },
    },
  });
  if (!project) return null;
  const purchaseOrders = project.purchaseOrders || [];
  await ensureInventoryEntriesForProject(project.id, purchaseOrders);
  const saleIds = purchaseOrders.filter((po) => po.saleId).map((po) => po.saleId || "") || [];
  let saleMap = new Map<string, any>();
  if (saleIds.length) {
    const sales = await prisma.order.findMany({
      where: { id: { in: saleIds } },
      include: { payment: true },
    });
    saleMap = new Map(sales.map((sale) => [sale.id, sale]));
  }
  const enrichedPurchaseOrders = purchaseOrders.map((po) => ({
    ...po,
    sale: po.saleId ? saleMap.get(po.saleId) || null : null,
  }));
  const inventoryEntries = await prisma.carpentryProjectInventoryEntry.findMany({
    where: { projectId: project.id },
    include: { purchaseOrder: true },
  });
  const inventoryDeliveries = await prisma.carpentryProjectInventoryDelivery.findMany({
    where: { projectId: project.id },
    include: {
      deliveredBy: true,
      items: { include: { entry: true } },
    },
    orderBy: { deliveredAt: "desc" },
  });

  return {
    ...project,
    purchaseOrders: enrichedPurchaseOrders,
    inventoryEntries,
    inventoryDeliveries,
  };
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
  requireProjectManager(session);
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
  const budgetFiles = parseProjectFiles(formData, "budgetFiles[]");
  const renderFiles = parseProjectFiles(formData, "renderFiles[]");
  const paymentProofFiles = parseProjectFiles(formData, "paymentProofFiles[]");
  const materialsFiles = parseProjectFiles(formData, "materialsFiles[]");
  const materialsListName = String(formData.get("materialsListName") || "").trim();
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
    await saveProjectFiles(tx, project.id, budgetFiles);
    await saveProjectFiles(tx, project.id, renderFiles);
    await saveProjectFiles(tx, project.id, paymentProofFiles);
    await saveProjectFiles(tx, project.id, materialsFiles);
    if (materialsFiles.length) {
      await tx.carpentryProjectMaterialList.create({
        data: {
          projectId: project.id,
          name: materialsListName || `${project.name} - Lista inicial`,
          fileUrl: materialsFiles[0].url,
          description: materialsFiles[0].filename || null,
        },
      });
    }
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
  requireProjectManager(session);
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
  requireProjectManager(session);
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

export async function deleteCarpentryClientPayment(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const id = String(formData.get("id") || "").trim();
  if (!id) {
    redirect("/dashboard/admin/carpinteria?error=Pago%20no%20especificado");
  }
  const payment = await prisma.carpentryClientPayment.findUnique({ where: { id } });
  if (!payment) {
    redirect("/dashboard/admin/carpinteria?error=Pago%20no%20encontrado");
  }
  await prisma.carpentryClientPayment.delete({ where: { id } });
  redirect(`/dashboard/admin/carpinteria/${payment.projectId}?message=Abono%20eliminado`);
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
  const productionOrderId = String(formData.get("productionOrderId") || "").trim() || null;

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
          productionOrderId,
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

const purchaseStatusMap: Record<string, string> = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

const expenseTypeMap: Record<string, string> = {
  FLETE: "FLETE",
  EXTRA: "EXTRA",
  MATERIAL: "MATERIAL",
  OTRO: "OTRO",
};

const productionStatusMap: Record<string, string> = {
  PLANNED: "PLANNED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  ON_HOLD: "ON_HOLD",
};

const phaseLabelMap: Record<string, CarpentryProjectPhase> = {
  FABRICACION: "FABRICACION",
  INSTALACION: "INSTALACION",
  CORTE_CANTEADO: "CORTE_CANTEADO",
  ARMADO_ESTRUCTURA: "ARMADO_ESTRUCTURA",
  ARMADO_PUERTAS: "ARMADO_PUERTAS",
  INSTALACION_HERRAJES: "INSTALACION_HERRAJES",
  EMBALAJE: "EMBALAJE",
  ALMACEN: "ALMACEN",
};

function normalizeEnum<T extends Record<string, string>>(map: T, value: string, fallback: T[keyof T]) {
  const key = value.toUpperCase();
  return (map[key] as T[keyof T]) || fallback;
}

export async function createCarpentryProjectMaterialList(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const projectId = String(formData.get("projectId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const fileUrl = String(formData.get("fileUrl") || "").trim();
  const itemsRaw = String(formData.get("items") || "[]");
  const phaseRaw = String(formData.get("phase") || "").toUpperCase();
  const deliveredAtRaw = String(formData.get("deliveredAt") || "").trim();
  const deliveredByIdRaw = String(formData.get("deliveredById") || "").trim();
  if (!projectId || !name || !fileUrl) {
    redirect("/dashboard/admin/carpinteria?error=Lista%20invalida");
  }
  let items: any[] = [];
  try {
    items = JSON.parse(itemsRaw);
    if (!Array.isArray(items)) items = [];
  } catch {
    items = [];
  }
  const normalizedPhase = phaseRaw && phaseLabelMap[phaseRaw] ? phaseLabelMap[phaseRaw] : null;
  const deliveredAt = deliveredAtRaw ? parseDate(deliveredAtRaw) : null;
  const deliveredById = deliveredByIdRaw || null;
  await prisma.carpentryProjectMaterialList.create({
    data: {
      projectId,
      name,
      description,
      fileUrl,
      phase: normalizedPhase as any,
      deliveredAt: deliveredAt as any,
      deliveredById,
      items: {
        create: items.map((item) => ({
          sku: item?.sku || null,
          name: String(item?.name || "").trim() || "Material",
          category: item?.category || null,
          unit: item?.unit || null,
          quantity: Number(item?.quantity) || 0,
          unitPriceUSD: toDecimal(item?.unitPriceUSD, 0) as any,
        })),
      },
    },
  });
  redirect(`/dashboard/admin/carpinteria/${projectId}?message=Lista%20de%20materiales%20guardada`);
}

export async function createCarpentryProjectPurchaseOrder(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const projectId = String(formData.get("projectId") || "").trim();
  const totalUSD = toDecimal(formData.get("totalUSD"), 0);
  const saleId = String(formData.get("saleId") || "").trim() || null;
  const statusRaw = String(formData.get("status") || "PENDING").toUpperCase();
  const notes = String(formData.get("notes") || "").trim() || null;
  const requireSecret = parseBool(String(formData.get("requiresSecret") || ""));
  const secretToken = requireSecret ? String(formData.get("secretToken") || "").trim() : null;
  if (!projectId || totalUSD <= 0) {
    redirect("/dashboard/admin/carpinteria?error=Orden%20invalida");
  }
  await prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.carpentryProjectPurchaseOrder.create({
      data: {
        projectId,
        saleId,
        totalUSD: totalUSD as any,
        status: normalizeEnum(purchaseStatusMap, statusRaw, purchaseStatusMap.PENDING),
        requiresSecret: requireSecret,
        secretToken,
        notes,
      },
    });
    await createInventoryEntriesFromOrder(tx, projectId, purchaseOrder.id, saleId);
  });
  redirect(`/dashboard/admin/carpinteria/${projectId}?message=Orden%20de%20compra%20creada`);
}

export async function createCarpentryProjectExpense(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const projectId = String(formData.get("projectId") || "").trim();
  if (!projectId) throw new Error("Proyecto requerido");
  const provider = String(formData.get("provider") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const expenseTypeRaw = String(formData.get("expenseType") || "MATERIAL").toUpperCase();
  const date = parseDate(String(formData.get("date") || ""));
  const quantity = Number(formData.get("quantity") || "1") || 1;
  const unitCostUSD = toDecimal(formData.get("unitCostUSD"), 0);
  const totalCostUSD = toDecimal(formData.get("totalCostUSD"), quantity * unitCostUSD);
  const invoiceNumber = String(formData.get("invoiceNumber") || "").trim() || null;
  const receiptUrl = String(formData.get("receiptUrl") || "").trim() || null;
  const createdById = (session?.user as any)?.id || null;
  if (!provider || !description || !date) {
    redirect(`/dashboard/admin/carpinteria/${projectId}?error=Datos%20incompletos`);
  }
  await prisma.carpentryProjectExpense.create({
    data: {
      projectId,
      provider,
      invoiceNumber,
      description,
      expenseType: normalizeEnum(expenseTypeMap, expenseTypeRaw, expenseTypeMap.MATERIAL) as any,
      date,
      quantity,
      unitCostUSD: unitCostUSD as any,
      totalCostUSD: totalCostUSD as any,
      receiptUrl,
      createdById,
    },
  });
  redirect(`/dashboard/admin/carpinteria/${projectId}?message=Gasto%20registrado`);
}

export async function createCarpentryProjectInventoryDelivery(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const projectId = String(formData.get("projectId") || "").trim();
  const purchaseOrderId = String(formData.get("purchaseOrderId") || "").trim();
  const phaseRaw = String(formData.get("phase") || "").trim().toUpperCase();
  const deliveredById = String(formData.get("deliveredById") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const phaseValue = (Object.values(CarpentryProjectPhase) as string[]).includes(phaseRaw)
    ? (phaseRaw as CarpentryProjectPhase)
    : null;

  const items: { entryId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("entry_")) continue;
    const entryId = key.replace("entry_", "");
    const qty = Number(String(value || "").trim());
    if (Number.isFinite(qty) && qty > 0) {
      items.push({ entryId, quantity: Math.round(qty) });
    }
  }

  if (!projectId || !purchaseOrderId || !items.length) {
    redirect(`/dashboard/admin/carpinteria/${projectId}?error=La%20entrega%20requiere%20una%20orden%20y%20al%20menos%20un%20material`);
  }

  await prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.carpentryProjectPurchaseOrder.findUnique({
      where: { id: purchaseOrderId },
    });
    if (!purchaseOrder || purchaseOrder.projectId !== projectId) {
      throw new Error("Orden inválida");
    }
    const delivery = await tx.carpentryProjectInventoryDelivery.create({
      data: {
        projectId,
        purchaseOrderId,
        phase: phaseValue,
        deliveredById,
        notes,
      },
    });
    for (const item of items) {
      const entry = await tx.carpentryProjectInventoryEntry.findUnique({
        where: { id: item.entryId },
        select: { remainingQuantity: true, projectId: true },
      });
      if (!entry || entry.projectId !== projectId) {
        throw new Error("Entrada de inventario inválida");
      }
      if (entry.remainingQuantity < item.quantity) {
        throw new Error("Cantidad mayor que la existencia disponible");
      }
      await tx.carpentryProjectInventoryEntry.update({
        where: { id: entry.id },
        data: { remainingQuantity: entry.remainingQuantity - item.quantity },
      });
      await tx.carpentryProjectInventoryDeliveryItem.create({
        data: {
          deliveryId: delivery.id,
          entryId: entry.id,
          quantity: item.quantity,
        },
      });
    }
  });

  redirect(`/dashboard/admin/carpinteria/${projectId}?message=Entrega%20registrada`);
}

export async function createProductionOrder(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const projectId = String(formData.get("projectId") || "").trim();
  const number = String(formData.get("number") || "").trim();
  const carpentryLeadId = String(formData.get("carpentryLeadId") || "").trim() || null;
  const supervisorId = String(formData.get("supervisorId") || "").trim() || null;
  const phaseRaw = String(formData.get("phase") || "").toUpperCase();
  const scheduledStart = parseDate(String(formData.get("scheduledStart") || ""));
  const scheduledEnd = parseDate(String(formData.get("scheduledEnd") || ""));
  const installDate = parseDate(String(formData.get("installDate") || ""));
  const statusRaw = String(formData.get("status") || "PLANNED").toUpperCase();
  const progressPct = toDecimal(formData.get("progressPct"), 0);
  const notes = String(formData.get("notes") || "").trim() || null;
  if (!projectId || !number) {
    redirect(`/dashboard/admin/carpinteria/${projectId}?error=Numero%20requerido`);
  }
  await prisma.productionOrder.create({
    data: {
      projectId,
      number,
      carpentryLeadId,
      supervisorId,
      phase: phaseRaw || null,
      scheduledStart,
      scheduledEnd,
      installDate,
      status: normalizeEnum(productionStatusMap, statusRaw, productionStatusMap.PLANNED) as any,
      progressPct: progressPct as any,
      notes,
    },
  });
  redirect(`/dashboard/admin/carpinteria/${projectId}?message=Orden%20de%20produccion%20creada`);
}
