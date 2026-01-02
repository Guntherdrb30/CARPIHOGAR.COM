import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

type Model3DStatus = 'NOT_CONFIGURED' | 'PENDING' | 'PROCESSING' | 'READY' | 'ERROR';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = String(searchParams.get('productId') || '').trim();

  if (!productId) {
    return NextResponse.json(
      { status: 'NOT_CONFIGURED', glbUrl: null, lastError: 'productId required' },
      { status: 400 },
    );
  }

  try {
    const asset = await prisma.model3DAsset.findFirst({
      where: { productId, archived: false },
      select: { status: true, glbPath: true, processingError: true },
    });

    if (!asset) {
      return NextResponse.json({ status: 'NOT_CONFIGURED', glbUrl: null, lastError: null });
    }

    const status = asset.status as Model3DStatus;
    const glbUrl =
      status === 'READY' && asset.glbPath
        ? `/api/3d/model-file?productId=${encodeURIComponent(productId)}`
        : null;

    // glbUrl is meant to be consumed by a future 3D viewer (Three.js / React Three Fiber).
    return NextResponse.json(
      {
        status,
        glbUrl,
        lastError: asset.processingError || null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'ERROR',
        glbUrl: null,
        lastError: String(err?.message || err || 'error'),
      },
      { status: 500 },
    );
  }
}
