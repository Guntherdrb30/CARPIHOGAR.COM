"use client";
import React, { useEffect, useRef, useState } from "react";
import { useAssistantCtx } from "./AssistantProvider";
import { useVoiceSession } from "./hooks/useVoiceSession";
import { speak, stopSpeaking } from "./hooks/speech";

export default function VoiceMic() {
  const a = useAssistantCtx();
  const bufferRef = useRef<string>("");
  const timerRef = useRef<any>(null);
  const resumeRef = useRef(false);
  const [pending, setPending] = useState(false);

  const dedupeWords = (text: string) => {
    try {
      const t = String(text).replace(/\s+/g, " ").trim();
      if (!t) return t;
      const parts = t.split(" ");
      const out: string[] = [];
      for (const w of parts) {
        const last = out[out.length - 1];
        if (last && last.toLowerCase() === w.toLowerCase()) continue;
        out.push(w);
      }
      return out.join(" ");
    } catch {
      return text;
    }
  };

  const mergeTranscript = (base: string, next: string) => {
    const aParts = String(base || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
    const bParts = String(next || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
    if (aParts.length === 0) return bParts.join(" ");
    if (bParts.length === 0) return aParts.join(" ");
    const aLower = aParts.map((w) => w.toLowerCase());
    const bLower = bParts.map((w) => w.toLowerCase());
    let overlap = 0;
    const max = Math.min(aLower.length, bLower.length);
    for (let i = 1; i <= max; i++) {
      const aTail = aLower.slice(aLower.length - i).join(" ");
      const bHead = bLower.slice(0, i).join(" ");
      if (aTail === bHead) overlap = i;
    }
    return [...aParts, ...bParts.slice(overlap)].join(" ");
  };
  const onFinal = async (text: string) => {
    const t = String(text || "").trim();
    if (!t) return;
    bufferRef.current = mergeTranscript(bufferRef.current, t);
    if (timerRef.current) clearTimeout(timerRef.current);
    setPending(true);
    timerRef.current = setTimeout(async () => {
      const finalText = dedupeWords(bufferRef.current.trim());
      bufferRef.current = "";
      setPending(false);
      if (finalText) {
        await a.sendMessage(finalText);
        a.setTtsEnabled(true);
      }
    }, 700);
  };
  const v = useVoiceSession(onFinal);

  useEffect(() => {
    // Al desmontar, apagamos TTS y cualquier voz en curso
    return () => { a.setTtsEnabled(false); stopSpeaking(); };
  }, []);

  useEffect(() => {
    const onTtsStart = () => {
      if (v.listening) {
        resumeRef.current = true;
        v.stop();
      }
    };
    const onTtsEnd = () => {
      if (resumeRef.current) {
        resumeRef.current = false;
        v.start();
      }
    };
    window.addEventListener("assistant:tts_start", onTtsStart as any);
    window.addEventListener("assistant:tts_end", onTtsEnd as any);
    return () => {
      window.removeEventListener("assistant:tts_start", onTtsStart as any);
      window.removeEventListener("assistant:tts_end", onTtsEnd as any);
    };
  }, [v]);

  const toggle = () => {
    if (v.listening) {
      // Usuario interrumpe: dejamos de escuchar y apagamos TTS
      resumeRef.current = false;
      v.stop();
      a.setTtsEnabled(false);
      stopSpeaking();
    } else {
      // Antes de escuchar, asegúrate de que el asistente no esté hablando
      stopSpeaking();
      a.setTtsEnabled(false);
      v.start();
    }
  };

  return (
    <button
      onClick={toggle}
      className={`px-3 py-2 rounded-full ${v.listening ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-200'}`}
      title={v.listening ? 'Detener' : 'Hablar'}
      aria-pressed={v.listening}
      aria-label="Hablar con el asistente"
    >
      {pending ? '…' : (v.listening ? '●' : '🎤')}
    </button>
  );
}
