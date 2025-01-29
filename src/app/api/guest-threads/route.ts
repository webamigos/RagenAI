import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
import { createNewThread } from '../../lib/services/thread';
import { setSentryServiceTag } from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

export const POST = async () => {
  try {
    setSentryServiceTag('guest-threads');
    const threadResult = await createNewThread();

    return NextResponse.json(threadResult, { status: StatusCodes.CREATED });
  } catch (error) {
    logger.error({ err: error }, 'Cannot create guest thread');
    return NextResponse.json(
      { error: 'Cannot create guest thread' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
