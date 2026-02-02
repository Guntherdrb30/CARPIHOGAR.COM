import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { CarpentryProjectPhase } from "@prisma/client";

const phases = Object.values(CarpentryProjectPhase);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session?.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const projectId = String(body?.projectId || "").trim();
    const description = String(body?.description || "").trim();
    const progressDateRaw = String(body?.progressDate || "").trim();
    const phaseRaw = String(body?.phase || CarpentryProjectPhase.FABRICACION).toUpperCase();
    const responsibleEmployeeId = String(body?.responsibleEmployeeId || "").trim() || null;
    const imageUrl = String(body?.imageUrl || "").trim() || null;

    if (!projectId || !description) {
      return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
    }
    const progressDate = progressDateRaw ? new Date(progressDateRaw) : new Date();
    if (Number.isNaN(progressDate.getTime())) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    }

    const phase = phases.includes(phaseRaw as CarpentryProjectPhase)
      ? (phaseRaw as CarpentryProjectPhase)
      : CarpentryProjectPhase.FABRICACION;

    await prisma.carpentryProjectUpdate.create({
      data: {
        projectId,
        description,
        progressDate,
        phase,
        responsibleEmployeeId,
        imageUrl: imageUrl || null,
        createdById: (session?.user as any)?.id || null,
      },
    });

    try {
      revalidatePath(`/dashboard/admin/carpinteria/${projectId}`);
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 });
  }
}
