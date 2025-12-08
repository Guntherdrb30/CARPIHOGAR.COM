import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const form = await req.formData();
  const userId = String(form.get("userId") || "");
  const file = form.get("file") as File | null;

  if (!userId || !file) {
    return NextResponse.json(
      { error: "userId y archivo son requeridos" },
      { status: 400 },
    );
  }

  try {
    const origin = new URL(req.url).origin;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", "document");
    const res = await fetch(`${origin}/api/upload`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok || !data?.url) {
      return NextResponse.json(
        { error: data?.error || "No se pudo subir el contrato" },
        { status: 500 },
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { deliverySignedContractUrl: String(data.url) },
    });

    return NextResponse.json({ ok: true, url: data.url });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Error interno" },
      { status: 500 },
    );
  }
}
