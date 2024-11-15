import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { createNewOpenAIThread } from '../../lib/services/thread';
import { setSentryServiceTag } from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

export const POST = async () => {
  try {
    setSentryServiceTag('threads');
    const threadResult = await createNewOpenAIThread();

    return NextResponse.json(threadResult, { status: StatusCodes.CREATED });
  } catch (error) {
    logger.error({ err: error }, 'Cannot create thread');
    return NextResponse.json(
      { error: 'Cannot create thread' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
