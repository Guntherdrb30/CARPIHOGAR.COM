"use client";

type TtsVoice = {
  id: string;
  label: string;
};

const VOICE_STORAGE_KEY = "assistant.openai.voice";
const DEFAULT_VOICE = "nova";
const AVAILABLE_VOICES: TtsVoice[] = [
  { id: "alloy", label: "Alloy" },
  { id: "echo", label: "Echo" },
  { id: "fable", label: "Fable" },
  { id: "onyx", label: "Onyx" },
  { id: "nova", label: "Nova" },
  { id: "shimmer", label: "Shimmer" },
];

let cachedVoiceName: string | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentController: AbortController | null = null;

function dispatchTtsEvent(name: "assistant:tts_start" | "assistant:tts_end") {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(name));
  } catch {}
}

function getStoredVoiceName(): string | null {
  if (cachedVoiceName !== null) return cachedVoiceName;
  try {
    cachedVoiceName = localStorage.getItem(VOICE_STORAGE_KEY) || null;
  } catch {
    cachedVoiceName = null;
  }
  return cachedVoiceName;
}

export function getAvailableVoices(): TtsVoice[] {
  return AVAILABLE_VOICES;
}

export function setPreferredVoiceName(name: string | null) {
  cachedVoiceName = name && String(name).trim() ? String(name).trim() : null;
  try {
    if (!cachedVoiceName) localStorage.removeItem(VOICE_STORAGE_KEY);
    else localStorage.setItem(VOICE_STORAGE_KEY, cachedVoiceName);
  } catch {}
}

export function getPreferredVoiceName(): string | null {
  return getStoredVoiceName();
}

export async function speak(text: string) {
  const t = String(text || "").trim();
  if (!t) return;
  stopSpeaking();

  const voice = getStoredVoiceName() || DEFAULT_VOICE;
  const controller = new AbortController();
  currentController = controller;
  try {
    const res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t, voice }),
      signal: controller.signal,
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    const cleanup = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      dispatchTtsEvent("assistant:tts_end");
      if (currentAudio === audio) currentAudio = null;
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    dispatchTtsEvent("assistant:tts_start");
    await audio.play();
  } catch {
    // ignore
    dispatchTtsEvent("assistant:tts_end");
  }
}

export function stopSpeaking() {
  try {
    if (currentController) currentController.abort();
  } catch {}
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  } catch {}
  dispatchTtsEvent("assistant:tts_end");
}
