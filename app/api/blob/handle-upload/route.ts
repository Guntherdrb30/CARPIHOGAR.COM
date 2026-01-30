import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'BLOB_READ_WRITE_TOKEN faltante en el entorno' }, { status: 400 });
    }
    const url = new URL(request.url);
    const scope = (url.searchParams.get('scope') || 'admin').toLowerCase();

    // Auth: para admin exigir sesión; para registro público permitir pero restringido
    if (scope !== 'registration') {
      const session = await getServerSession(authOptions as any);
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const isRegistration = scope === 'registration';
    const body = await request.json();
    const res = await handleUpload({
      request,
      body,
      token,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: isRegistration
            ? ['image/*']
            : ['image/*', 'video/*', 'application/pdf', 'text/csv'],
          // Para admin/ajustes permitimos videos de alta calidad (hasta ~500MB).
          // Para registros p�blicos seguimos con 8MB.
          maximumSizeInBytes: isRegistration ? 8 * 1024 * 1024 : 500 * 1024 * 1024,
          addRandomSuffix: true,
          cacheControlMaxAge: 60 * 60 * 24 * 365, // 1 year
        };
      },
      onUploadCompleted: async ({ blob }) => {
        try {
          console.log('[blob] upload completed', blob.pathname);
        } catch {}
      },
    });
    return NextResponse.json(res);
  } catch (err: any) {
    console.error('[blob] handle-upload error', err?.message || err);
    return NextResponse.json({ error: 'Blob handle-upload failed', details: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const hasToken = !!process.env.BLOB_READ_WRITE_TOKEN;
    return NextResponse.json({ ok: true, hasToken });
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
