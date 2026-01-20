import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runTrends172StudioAgent } from "@/server/assistant/trends172StudioAgent";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = String((session?.user as any)?.role || "");
  if (!session?.user || (role !== "ADMIN" && role !== "ARCHITECTO")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const text =
    String(body?.text || "").trim() || String(body?.input_as_text || "").trim();
  const history = Array.isArray(body?.history) ? body.history : undefined;

  if (!text) {
    return NextResponse.json({ error: "Texto requerido" }, { status: 400 });
  }

  const result = await runTrends172StudioAgent({ text, history });
  if (!result?.reply) {
    return NextResponse.json({ error: "Sin respuesta" }, { status: 500 });
  }

  return NextResponse.json(result);
}
