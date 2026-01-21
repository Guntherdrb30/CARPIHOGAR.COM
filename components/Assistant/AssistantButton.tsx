"use client";
import React from "react";
import { useAssistantCtx } from "./AssistantProvider";
import { Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

export default function AssistantButton() {
  const a = useAssistantCtx();
  const pathname = usePathname() || "";
  const open = () => a.setOpen(true);
  // Hide on admin/dashboard
  if (pathname.startsWith("/dashboard")) return null;
  return (
    <div className="fixed z-50 bottom-4 right-4 flex items-center gap-2">
      <button
        onClick={open}
        className="h-14 w-14 rounded-full atlas-button flex items-center justify-center atlas-shadow"
        aria-label="Abrir asistente"
        title="Asistente"
      >
        <Sparkles size={24} />
      </button>
      <button
        onClick={open}
        className="hidden sm:inline px-3 py-2 rounded-full bg-white border text-sm font-medium hover:bg-gray-50 atlas-shadow"
        aria-label="Abrir Asistente"
      >
        Asistente
      </button>
    </div>
  );
}
