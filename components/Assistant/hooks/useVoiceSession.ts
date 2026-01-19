"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Recog = any;

function dedupeWords(text: string): string {
  try {
    const t = String(text).replace(/\s+/g, ' ').trim();
    if (!t) return t;
    const parts = t.split(' ');
    const out: string[] = [];
    for (const w of parts) {
      const last = out[out.length - 1];
      if (last && last.toLowerCase() === w.toLowerCase()) continue;
      out.push(w);
    }
    return out.join(' ');
  } catch { return text; }
}

export function useVoiceSession(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interimText, setInterim] = useState("");
  const recogRef = useRef<Recog | null>(null);
  const lastFinalRef = useRef<string>("");
  const silenceTimerRef = useRef<any>(null);
  const SILENCE_MS = 4000;

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      const r: any = recogRef.current;
      if (!r) return;
      try { r.stop(); } catch {}
    }, SILENCE_MS);
  }, [clearSilenceTimer]);

  useEffect(() => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r: any = new SR();
    r.lang = 'es-ES';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const raw = res[0].transcript;
          const cleaned = dedupeWords(raw);
          if (cleaned && cleaned !== lastFinalRef.current) {
            lastFinalRef.current = cleaned;
            onFinal(cleaned);
          }
          setInterim("");
        } else {
          interim += res[0].transcript;
        }
      }
      armSilenceTimer();
      if (interim) setInterim(interim);
    };
    r.onend = () => {
      clearSilenceTimer();
      setListening(false);
    };
    recogRef.current = r;
    return () => {
      clearSilenceTimer();
      try { r.stop(); } catch {}
    };
  }, [onFinal, armSilenceTimer, clearSilenceTimer]);

  const start = useCallback(() => {
    const r: any = recogRef.current;
    if (!r) return;
    setInterim("");
    lastFinalRef.current = "";
    try { r.start(); setListening(true); } catch {}
    armSilenceTimer();
  }, [armSilenceTimer]);

  const stop = useCallback(() => {
    const r: any = recogRef.current;
    if (!r) return;
    clearSilenceTimer();
    try { r.stop(); } catch {}
  }, [clearSilenceTimer]);

  return { listening, interimText, start, stop };
}
