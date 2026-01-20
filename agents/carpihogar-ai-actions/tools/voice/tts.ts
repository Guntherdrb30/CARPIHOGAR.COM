export async function run(input: { text: string; voice?: string }) {
  const text = String(input?.text || '').trim();
  const voice = String(input?.voice || 'alloy');
  if (!text) return { success: false, message: 'text requerido', data: null };
  const audioUrl = `/api/voice/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}`;
  return { success: true, message: 'OK', data: { audioUrl } };
}
