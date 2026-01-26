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

export async function getPayrollPayments() {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  return prisma.payrollPayment.findMany({
    include: { employee: true, project: true },
    orderBy: { paidAt: "desc" },
    take: 200,
  });
}

export async function createPayrollPayment(formData: FormData) {
  const session = await getServerSession(authOptions);
  requireAdmin(session);
  const employeeId = String(formData.get("employeeId") || "").trim() || null;
  const category = String(formData.get("category") || "OTRO").toUpperCase();
  const amountUSD = toDecimal(formData.get("amountUSD"), 0);
  const paidAtRaw = String(formData.get("paidAt") || "").trim();
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
  const methodRaw = String(formData.get("method") || "").toUpperCase();
  const reference = String(formData.get("reference") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const service = String(formData.get("service") || "").trim() || null;
  if (!amountUSD || amountUSD <= 0) {
    redirect("/dashboard/admin/nomina?error=Monto%20invalido");
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
      paidAt: paidAt as any,
      method: method as any,
      reference,
      description,
      service,
    },
  });
  redirect("/dashboard/admin/nomina?message=Pago%20registrado");
}
