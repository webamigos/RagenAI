import { NextResponse, type NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';

import { broadcastSSE } from '../stream/route';

export const dynamic = 'force-dynamic';

function hashToFixedLength(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export async function POST(request: NextRequest) {
  const secretKey = request.headers.get('x-worker-secret');
  const expectedKey = process.env.WORKER_SECRET_KEY;

  if (!expectedKey || !secretKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (
    !timingSafeEqual(
      hashToFixedLength(secretKey),
      hashToFixedLength(expectedKey),
    )
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, message } = body as Record<string, unknown>;

  if (!event || !message) {
    return NextResponse.json(
      { error: 'Missing event or message' },
      { status: 400 },
    );
  }

  broadcastSSE(event as string, message);

  return NextResponse.json({ ok: true });
}
