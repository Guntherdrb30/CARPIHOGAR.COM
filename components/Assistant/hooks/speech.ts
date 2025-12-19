"use client";

let cachedVoice: SpeechSynthesisVoice | null = null;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function selectSpanishFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const synth = window.speechSynthesis;
  const voices = synth.getVoices() || [];
  if (!voices.length) return null;

  const esVoices = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("es"));

  const preferredNames = [
    "microsoft sabina",
    "microsoft laura",
    "microsoft helena",
    "microsoft hilda",
    "microsoft paulina",
    "google espanol",
    "google espanol de estados unidos",
  ];

  for (const pref of preferredNames) {
    const match = esVoices.find((v) => normalize(v.name).includes(normalize(pref)));
    if (match) return match;
  }

  if (esVoices.length) return esVoices[0];
  return voices[0] || null;
}

export function speak(text: string) {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;

    // Evita que se superpongan varias voces
    synth.cancel();

    if (!cachedVoice) {
      cachedVoice = selectSpanishFemaleVoice();
      if (!cachedVoice) {
        const handler = () => {
          cachedVoice = selectSpanishFemaleVoice();
          synth.removeEventListener("voiceschanged", handler);
        };
        synth.addEventListener("voiceschanged", handler);
      }
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.98;
    utter.pitch = 1.08;
    utter.volume = 1.0;
    utter.lang = (cachedVoice && cachedVoice.lang) || "es-ES";
    if (cachedVoice) utter.voice = cachedVoice;

    synth.speak(utter);
  } catch {
    // no-op
  }
}

export function stopSpeaking() {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
  } catch {
    // no-op
  }
}
