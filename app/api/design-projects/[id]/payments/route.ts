"use server";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PaymentMethod } from "@prisma/client";
import { logDesignProjectAudit } from "@/lib/design-project-audit";

const METHOD_VALUES = Object.values(PaymentMethod);

function parseAmount(value: any) {
  const raw = String(value || "").replace(",", ".").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function parseDate(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const dt = new Date(`${raw}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payments = await prisma.designProjectPayment.findMany({
    where: { projectId: params.id },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ payments });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  const userId = String((session?.user as any)?.id || "");
  if (!userId || role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const project = await prisma.designProject.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const amountUSD = parseAmount(body?.amountUSD);
  const paidAt = parseDate(body?.paidAt);
  const methodRaw = String(body?.method || "").trim().toUpperCase();
  const method = METHOD_VALUES.includes(methodRaw as PaymentMethod)
    ? (methodRaw as PaymentMethod)
    : null;
  const reference = String(body?.reference || "").trim() || null;
  const fileUrl = String(body?.fileUrl || "").trim() || null;

  if (!amountUSD || !paidAt) {
    return NextResponse.json({ error: "Monto y fecha requeridos" }, { status: 400 });
  }

  const payment = await prisma.designProjectPayment.create({
    data: {
      projectId: params.id,
      amountUSD: amountUSD as any,
      paidAt,
      method,
      reference,
      fileUrl,
      createdById: userId,
    },
  });

  await logDesignProjectAudit({
    projectId: params.id,
    userId,
    action: "DESIGN_PROJECT_PAYMENT_ADDED",
    details: `amountUSD:${Number(amountUSD).toFixed(2)};paidAt:${paidAt.toISOString().slice(0, 10)};method:${method || "null"};reference:${reference || "null"}`,
  });
  if (fileUrl) {
    await logDesignProjectAudit({
      projectId: params.id,
      userId,
      action: "DESIGN_PROJECT_FILE_UPLOADED",
      details: `type:payment;paymentId:${payment.id};file:${fileUrl}`,
    });
  }
  return NextResponse.json({ payment }, { status: 201 });
}
