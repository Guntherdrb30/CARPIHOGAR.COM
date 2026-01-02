import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const getOutputRoot = () =>
  process.env.MODEL3D_OUTPUT_DIR || path.join(process.cwd(), 'data', 'models');

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = String(searchParams.get('productId') || '').trim();

  if (!productId) {
    return new NextResponse('productId required', { status: 400 });
  }

  try {
    const asset = await prisma.model3DAsset.findFirst({
      where: { productId, archived: false, status: 'READY' },
      select: { glbPath: true, id: true },
    });

    if (!asset?.glbPath) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const glbPath = path.isAbsolute(asset.glbPath)
      ? asset.glbPath
      : path.join(getOutputRoot(), asset.glbPath);

    const data = await fs.readFile(glbPath);

    // GLB is served with a proper content type so web viewers can load it directly.
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': `inline; filename="${asset.id}.glb"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}
