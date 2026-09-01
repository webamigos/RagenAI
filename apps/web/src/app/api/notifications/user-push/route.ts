import { NextResponse, type NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';

import { sendNotificationToUser } from '@/features/notifications/utils/send-notification-to-user';
import { NotificationType } from '@/generated/prisma/client';

export const dynamic = 'force-dynamic';

function hashToFixedLength(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

const VALID_TYPES = new Set<string>(Object.values(NotificationType));

export async function POST(request: NextRequest) {
  const secretKey = request.headers.get('x-worker-secret') ?? 'placeholder';
  const expectedKey = process.env.WORKER_SECRET_KEY ?? 'placeholder';

  if (
    !timingSafeEqual(
      hashToFixedLength(secretKey),
      hashToFixedLength(expectedKey),
    ) ||
    !process.env.WORKER_SECRET_KEY
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const {
    userId,
    organizationId,
    type,
    title,
    body: msgBody,
    resourceUrl,
  } = body as Record<string, unknown>;

  if (
    typeof userId !== 'string' ||
    typeof organizationId !== 'string' ||
    typeof type !== 'string' ||
    typeof title !== 'string' ||
    !VALID_TYPES.has(type)
  ) {
    return NextResponse.json(
      {
        error: 'Missing or invalid fields: userId, organizationId, type, title',
      },
      { status: 400 },
    );
  }

  await sendNotificationToUser(
    userId,
    organizationId,
    type as NotificationType,
    {
      title,
      body: typeof msgBody === 'string' ? msgBody : undefined,
      resourceUrl: typeof resourceUrl === 'string' ? resourceUrl : undefined,
    },
  );

  return NextResponse.json({ ok: true });
}
