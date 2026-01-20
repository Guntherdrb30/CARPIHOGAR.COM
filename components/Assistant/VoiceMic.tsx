"use client";
import React, { useEffect, useRef, useState } from "react";
import { useAssistantCtx } from "./AssistantProvider";
import { useVoiceSession } from "./hooks/useVoiceSession";
import { stopSpeaking } from "./hooks/speech";

export default function VoiceMic() {
  const a = useAssistantCtx();
  const bufferRef = useRef<string>("");
  const timerRef = useRef<any>(null);
  const voiceActiveRef = useRef(false);
  const ttsPlayingRef = useRef(false);
  const ttsStartedAtRef = useRef(0);
  const ignoreResultsRef = useRef(false);
  const restartTimerRef = useRef<any>(null);
  const lastRestartRef = useRef(0);
  const [pending, setPending] = useState(false);
  const [active, setActive] = useState(false);

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
    if (ignoreResultsRef.current) return;
    bufferRef.current = mergeTranscript(bufferRef.current, t);
    if (timerRef.current) clearTimeout(timerRef.current);
    setPending(true);
    timerRef.current = setTimeout(async () => {
      const finalText = dedupeWords(bufferRef.current.trim());
      bufferRef.current = "";
      setPending(false);
      if (finalText) {
        if (voiceActiveRef.current) a.setTtsEnabled(true);
        await a.sendMessage(finalText);
      }
    }, 700);
  };
  const v = useVoiceSession(onFinal, {
    onSpeechStart: () => {
      if (!ttsPlayingRef.current) return;
      if (Date.now() - ttsStartedAtRef.current < 250) return;
      ignoreResultsRef.current = false;
      ttsPlayingRef.current = false;
      stopSpeaking();
    },
  });

  useEffect(() => {
    // Al desmontar, apagamos TTS y cualquier voz en curso
    return () => { a.setTtsEnabled(false); stopSpeaking(); };
  }, []);

  useEffect(() => {
    const onTtsStart = () => {
      ttsPlayingRef.current = true;
      ttsStartedAtRef.current = Date.now();
      ignoreResultsRef.current = true;
    };
    const onTtsEnd = () => {
      ttsPlayingRef.current = false;
      ignoreResultsRef.current = false;
      if (voiceActiveRef.current && !v.listening) {
        setTimeout(() => {
          if (voiceActiveRef.current && !v.listening) v.start();
        }, 150);
      }
    };
    window.addEventListener("assistant:tts_start", onTtsStart as any);
    window.addEventListener("assistant:tts_end", onTtsEnd as any);
    return () => {
      window.removeEventListener("assistant:tts_start", onTtsStart as any);
      window.removeEventListener("assistant:tts_end", onTtsEnd as any);
    };
  }, [v]);

  useEffect(() => {
    if (!voiceActiveRef.current) return;
    if (v.listening) return;
    const now = Date.now();
    if (now - lastRestartRef.current < 800) return;
    if (restartTimerRef.current) return;
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (voiceActiveRef.current && !v.listening) {
        lastRestartRef.current = Date.now();
        v.start();
      }
    }, 250);
    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    };
  }, [v.listening]);

  const toggle = () => {
    if (voiceActiveRef.current) {
      // Usuario interrumpe: dejamos de escuchar y apagamos TTS
      voiceActiveRef.current = false;
      setActive(false);
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      v.stop();
      a.setTtsEnabled(false);
      stopSpeaking();
    } else {
      // Activar modo voz continuo
      voiceActiveRef.current = true;
      setActive(true);
      a.setTtsEnabled(true);
      if (!v.listening) v.start();
    }
  };

  return (
    <button
      onClick={toggle}
      className={`px-3 py-2 rounded-full ${active ? 'bg-red-600 text-white' : 'bg-gray-200'} ${v.listening ? 'animate-pulse' : ''}`}
      title={active ? 'Detener' : 'Hablar'}
      aria-pressed={active}
      aria-label="Hablar con el asistente"
    >
      {pending ? '…' : (v.listening ? '●' : '🎤')}
    </button>
  );
}
