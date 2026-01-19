export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = String(searchParams.get('text') || '').trim();
  const voice = String(searchParams.get('voice') || 'nova');
  if (!text) return new Response('text requerido', { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return new Response('OPENAI_API_KEY no configurada', { status: 500 });
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, format: 'webm' }),
  });
  if (!res.ok || !res.body) return new Response('tts error', { status: 502 });
  return new Response(res.body as any, { headers: { 'Content-Type': 'audio/webm' } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = String(body?.text || '').trim();
  const voice = String(body?.voice || 'nova');
  if (!text) return new Response('text requerido', { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return new Response('OPENAI_API_KEY no configurada', { status: 500 });
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, format: 'webm' }),
  });
  if (!res.ok || !res.body) return new Response('tts error', { status: 502 });
  return new Response(res.body as any, { headers: { 'Content-Type': 'audio/webm' } });
}
