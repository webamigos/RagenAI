import { createHash, timingSafeEqual } from 'crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  verifyInternalSecret,
  InternalAuthError,
  recordInternalAuthFailure,
} from '@/app/api/v1/utils';
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';
import { SecurityEventType } from '@/generated/prisma/client';
import type { SecurityEventSource } from '@/features/security/contracts/security-event.types';

export const dynamic = 'force-dynamic';

function hashToFixedLength(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function verifyWorkerSecret(request: NextRequest): boolean {
  const secret = request.headers.get('x-worker-secret');
  const expected = process.env.WORKER_SECRET_KEY;
  if (!secret || !expected) {
    return false;
  }
  return timingSafeEqual(
    hashToFixedLength(secret),
    hashToFixedLength(expected),
  );
}

const SOURCE_VALUES: [SecurityEventSource, ...SecurityEventSource[]] = [
  'auth',
  'chat',
  'chatbot',
  'upload',
  'admin',
  'api',
  'mcp',
  'infra',
];

const bodySchema = z.object({
  eventType: z.nativeEnum(SecurityEventType),
  severity: z.enum(['info', 'warn', 'critical']),
  source: z.enum(SOURCE_VALUES),
  organizationId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  requestId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  if (verifyWorkerSecret(request)) {
    // authenticated via worker secret — proceed
  } else {
    try {
      verifyInternalSecret(request);
    } catch (err) {
      if (err instanceof InternalAuthError) {
        recordInternalAuthFailure(
          request,
          '/api/internal/security-events/notify',
          'bad secret',
        );
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  recordSecurityEvent({
    eventType: body.eventType,
    severity: body.severity,
    source: body.source,
    organizationId: body.organizationId ?? null,
    userId: body.userId ?? null,
    requestId: body.requestId ?? null,
    metadata: body.metadata,
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
