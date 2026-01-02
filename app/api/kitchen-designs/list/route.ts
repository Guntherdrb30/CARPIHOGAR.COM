import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUserId } from "@/app/api/moodboard/_utils";

export async function GET(req: Request) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json([]);
    }

    const designs = await prisma.kitchenDesign.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    const mapped = designs.map((d) => ({
      id: d.id,
      userId: d.userId,
      name: d.name,
      layoutType: d.layoutType,
      status: d.status,
      totalPriceUsd: Number(d.totalPriceUsd as any),
      plan: d.planJson ?? null,
      modules: d.modulesJson ?? null,
      budget: d.budgetJson ?? null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));

    return NextResponse.json(mapped);
  } catch (e: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: String(e?.message || e || "error") },
      { status: 500 },
    );
  }
}
