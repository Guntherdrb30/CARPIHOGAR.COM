import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0'))
      .join('')
  );
}

function darken(hex: string, factor = 0.7): string | undefined {
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
const ALLOWED_DOC_TYPES = ['application/pdf'];
const PUBLIC_MAX_BYTES = 5 * 1024 * 1024; // 5MB for unauthenticated uploads

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    // Parse form data first so we can decide auth policy based on file type
    const form = await req.formData();
    const file: any = form.get('file');
    const fileType =
      (form.get('type') as string) ||
      (String((form.get('file') as any)?.type || '').startsWith('video/') ? 'video' : 'image');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const mimeRaw = file.type || 'application/octet-stream';
    const mime = String(mimeRaw || '').toLowerCase();

    // MIME whitelist
    if (fileType === 'image') {
      if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
        return NextResponse.json(
          { error: 'Tipo de imagen no permitido. Usa JPG, PNG o WEBP.' },
          { status: 415 },
        );
      }
    } else if (fileType === 'video') {
      if (!ALLOWED_VIDEO_TYPES.includes(mime)) {
        return NextResponse.json(
          { error: 'Tipo de video no permitido. Usa MP4 o MOV.' },
          { status: 415 },
        );
      }
    } else if (fileType === 'document') {
      if (!ALLOWED_DOC_TYPES.includes(mime)) {
        return NextResponse.json(
          { error: 'Tipo de documento no permitido. Usa PDF.' },
          { status: 415 },
        );
      }
    } else {
      // Fallback: solo aceptar imagenes conocidas
      if (!mime.startsWith('image/')) {
        return NextResponse.json({ error: 'Tipo de archivo no permitido.' }, { status: 415 });
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sizeBytes = buffer.byteLength;

    // Session check (authenticated can upload images/videos; unauthenticated only small images)
    const session = await getServerSession(authOptions as any);
    const role = String((session?.user as any)?.role || '');
    const isAuthenticated = !!session && ['ADMIN', 'ALIADO', 'VENDEDOR'].includes(role);
    if (!isAuthenticated) {
      const isImage = fileType === 'image' || mime.startsWith('image/');
      if (!isImage) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (sizeBytes > PUBLIC_MAX_BYTES) {
        return NextResponse.json(
          { error: 'El archivo es demasiado grande (max 5MB)' },
          { status: 413 },
        );
      }
    }

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const nameGuess = (file as any).name ? String((file as any).name).toLowerCase() : '';
    let ext = nameGuess.match(/\.([a-z0-9]+)$/)?.[1] || '';
    if (!ext && mime && mime.includes('/')) {
      ext = mime.split('/')[1];
    }
    if (!ext) ext = 'bin';
    const filename = `${randomUUID()}.${ext}`;

    // Upload to Vercel Blob (persistent, read-only FS safe)
    const targetPath = `uploads/${year}/${month}/${filename}`;
    const uploaded = await put(targetPath, buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: mime,
    } as any);
    const uploadedUrl = (uploaded as any)?.url as string;

    if (fileType === 'image') {
      // Color detection from in-memory buffer
      let dominant: string | undefined = undefined;
      let secondary: string | undefined = undefined;
      try {
        const { data } = (await sharp(buffer)
          .resize(1, 1, { fit: 'cover' })
          .toColourspace('srgb')
          .raw()
          .toBuffer({ resolveWithObject: true })) as any;
        const r = data[0];
        const g = data[1];
        const b = data[2];
        const hex = '#' + [r, g, b].map((x: number) => x.toString(16).padStart(2, '0')).join('');
        dominant = hex;
        secondary = darken(hex, 0.6);
      } catch {}
      return NextResponse.json({ url: uploadedUrl, name: filename, dominant, secondary });
    } else {
      return NextResponse.json({ url: uploadedUrl, name: filename });
    }
  } catch (err) {
    console.error('Upload error', err);
    const msg = String((err as any)?.message || '').toLowerCase();
    if (msg.includes('input file contains unsupported image format')) {
      return NextResponse.json(
        { error: 'Formato de archivo no soportado por el procesador de imagenes' },
        { status: 415 },
      );
    }
    if ((err as any).type === 'entity.too.large') {
      return NextResponse.json(
        {
          error:
            'El archivo es demasiado grande para el servidor. Considera subir un video mas ligero o usar almacenamiento externo.',
        },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
