import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getIncompleteProductsCount } from '@/server/actions/products';

export async function GET() {
  const session = await getServerSession(authOptions as any);
  const role = String((session?.user as any)?.role || '');
  if (!session || role !== 'ADMIN') {
    return NextResponse.json({ count: 0 });
  }
  try {
    const count = await getIncompleteProductsCount();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
