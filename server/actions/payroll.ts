"use server";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

function requireAdmin(session: any) {
  const role = String(session?.user?.role || "");
  if (role !== "ADMIN") throw new Error("Not authorized");
}

type SessionUser = {
  id?: string;
  email?: string;
  role?: string;
};

const parseDateInput = (value?: string | null) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const isoOnly = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(raw);
  if (isoOnly) {
    const year = Number(isoOnly[1]);
    const month = Number(isoOnly[2]);
    const day = Number(isoOnly[3]);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

async function ensurePayrollPaymentColumns() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "public"."PayrollPayment" ADD COLUMN IF NOT EXISTS "tasaVES" DECIMAL(10,2)'
    );
  } catch {}

  try {
    await prisma.$executeRawUnsafe(
      'UPDATE "public"."PayrollPayment" ' +
        'SET "tasaVES" = (SELECT "tasaVES" FROM "public"."SiteSettings" WHERE "id" = 1) ' +
        'WHERE "tasaVES" IS NULL'
    );
  } catch {}
}

async function requireRootSession() {
  const session = await getServerSession(authOptions);
  const user = (session?.user as SessionUser) || {};
  const email = String(user.email || "").toLowerCase();
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  const isRoot = user.role === "ADMIN" && email === rootEmail;
  if (!isRoot) {
    throw new Error("Not authorized");
  }
  return { session, user };
}

const toDecimal = (value: FormDataEntryValue | null, fallback = 0) => {
  const n = Number(String(value || "").trim());
  return Number.isFinite(n) ? n : fallback;
};

type PayrollPaymentFilters = {
  startDate?: string | null;
  endDate?: string | null;
};

export async function getPayrollEmployees() {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  return prisma.payrollEmployee.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
}

export async function createPayrollEmployee(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "FIJA").toUpperCase();
  const weeklySalaryUSD = toDecimal(formData.get("weeklySalaryUSD"), 0);
  const role = String(formData.get("role") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  if (!name) {
    redirect("/dashboard/admin/nomina?error=Nombre%20requerido");
  }
  await prisma.payrollEmployee.create({
    data: {
      name,
      type: type === "CONTRATADA" ? "CONTRATADA" : "FIJA",
      weeklySalaryUSD: weeklySalaryUSD ? (weeklySalaryUSD as any) : null,
      role,
      phone,
      email,
      notes,
    },
  });
  redirect("/dashboard/admin/nomina?message=Empleado%20creado");
}

export async function updatePayrollEmployee(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Missing id");
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "").toUpperCase();
  const weeklySalaryUSD = toDecimal(formData.get("weeklySalaryUSD"), 0);
  const role = String(formData.get("role") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const active = String(formData.get("active") || "true");
  await prisma.payrollEmployee.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(type ? { type: type === "CONTRATADA" ? "CONTRATADA" : "FIJA" } : {}),
      weeklySalaryUSD: weeklySalaryUSD ? (weeklySalaryUSD as any) : null,
      role,
      phone,
      email,
      notes,
      active: !/^(0|false|no)$/i.test(active),
    },
  });
  redirect("/dashboard/admin/nomina?message=Empleado%20actualizado");
}

export async function deletePayrollEmployee(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Missing id");
  await prisma.payrollEmployee.delete({ where: { id } });
  redirect("/dashboard/admin/nomina?message=Empleado%20eliminado");
}

export async function getPayrollPayments(filters?: PayrollPaymentFilters) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  await ensurePayrollPaymentColumns();
  const where: Prisma.PayrollPaymentWhereInput = {};
  const startDate = parseDateInput(filters?.startDate || null);
  const endDate = parseDateInput(filters?.endDate || null);
  const dateFilter: Prisma.DateTimeFilter = {};
  if (startDate) {
    const normalizedStart = new Date(startDate);
    normalizedStart.setHours(0, 0, 0, 0);
    dateFilter.gte = normalizedStart;
  }
  if (endDate) {
    const normalizedEnd = new Date(endDate);
    normalizedEnd.setHours(23, 59, 59, 999);
    dateFilter.lte = normalizedEnd;
  }
  if (dateFilter.gte || dateFilter.lte) {
    where.paidAt = dateFilter;
  }
  return prisma.payrollPayment.findMany({
    include: { employee: true, project: true },
    where,
    orderBy: { paidAt: "desc" },
    take: 200,
  });
}

export async function createPayrollPayment(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  await ensurePayrollPaymentColumns();
  const employeeId = String(formData.get("employeeId") || "").trim() || null;
  const category = String(formData.get("category") || "OTRO").toUpperCase();
  const amountUSD = toDecimal(formData.get("amountUSD"), 0);
  const tasaVES = toDecimal(formData.get("tasaVES"), 0);
  const paidAtRaw = String(formData.get("paidAt") || "").trim();
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
  const methodRaw = String(formData.get("method") || "").toUpperCase();
  const reference = String(formData.get("reference") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const service = String(formData.get("service") || "").trim() || null;
  if (!amountUSD || amountUSD <= 0) {
    redirect("/dashboard/admin/nomina?error=Monto%20invalido");
  }
  if (!tasaVES || tasaVES <= 0) {
    redirect("/dashboard/admin/nomina?error=Tasa%20BCV%20requerida");
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
  await prisma.payrollPayment.create({
    data: {
      employeeId,
      category:
        category === "NOMINA_FIJA"
          ? "NOMINA_FIJA"
          : category === "NOMINA_CONTRATADA"
          ? "NOMINA_CONTRATADA"
          : category === "CARPINTERIA"
          ? "CARPINTERIA"
          : "OTRO",
      amountUSD: amountUSD as any,
      tasaVES: tasaVES as any,
      paidAt: paidAt as any,
      method: method as any,
      reference,
      description,
      service,
    },
  });
  redirect("/dashboard/admin/nomina?message=Pago%20registrado");
}

export async function updatePayrollPaymentTasa(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  await ensurePayrollPaymentColumns();
  const paymentId = String(formData.get("paymentId") || "").trim();
  const tasaVES = toDecimal(formData.get("tasaVES"), 0);
  if (!paymentId) throw new Error("Missing paymentId");
  if (!tasaVES || tasaVES <= 0) {
    redirect("/dashboard/admin/nomina?error=Tasa%20invalida");
  }
  await prisma.payrollPayment.update({
    where: { id: paymentId },
    data: { tasaVES: tasaVES as any },
  });
  redirect("/dashboard/admin/nomina?message=Tasa%20actualizada");
}

export async function applyPayrollWeekTasa(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  await ensurePayrollPaymentColumns();
  const weekStartRaw = String(formData.get("weekStart") || "").trim();
  const tasaVES = toDecimal(formData.get("tasaVES"), 0);
  if (!weekStartRaw) throw new Error("Missing weekStart");
  const isoOnly = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(weekStartRaw);
  if (!isoOnly) {
    redirect("/dashboard/admin/nomina?error=Semana%20invalida");
  }
  const year = Number(isoOnly[1]);
  const month = Number(isoOnly[2]);
  const day = Number(isoOnly[3]);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (!tasaVES || tasaVES <= 0) {
    redirect("/dashboard/admin/nomina?error=Tasa%20invalida");
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  await prisma.payrollPayment.updateMany({
    where: { paidAt: { gte: start as any, lte: end as any } },
    data: { tasaVES: tasaVES as any },
  });

  redirect("/dashboard/admin/nomina?message=Tasa%20semanal%20actualizada");
}

export async function updatePayrollPaymentDate(formData: FormData) {
  await requireRootSession();
  const paymentId = String(formData.get("paymentId") || "").trim();
  const paidAtRaw = String(formData.get("paidAt") || "").trim();
  if (!paymentId) throw new Error("Missing paymentId");
  if (!paidAtRaw) {
    redirect("/dashboard/admin/nomina?error=Fecha%20requerida");
  }
  const paidAt = new Date(paidAtRaw);
  if (Number.isNaN(paidAt.getTime())) {
    redirect("/dashboard/admin/nomina?error=Fecha%20invalida");
  }
  await prisma.payrollPayment.update({
    where: { id: paymentId },
    data: { paidAt: paidAt as any },
  });
  redirect("/dashboard/admin/nomina?message=Fecha%20actualizada");
}

export async function deletePayrollPayment(formData: FormData) {
  await requireRootSession();
  const paymentId = String(formData.get("paymentId") || "").trim();
  if (!paymentId) throw new Error("Missing paymentId");
  await prisma.payrollPayment.delete({ where: { id: paymentId } });
  redirect("/dashboard/admin/nomina?message=Pago%20eliminado");
}
