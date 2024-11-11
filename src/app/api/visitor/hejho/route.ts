import { NextResponse } from 'next/server';

import { clearVisitorMessages } from '../../../lib/services/visitor';
import { logger } from '../../../lib/utils/logger';
import { setSentryServiceTag } from '@/app/lib/services/sentry';
import { Sentry } from 'pino-sentry';

export const dynamic = 'force-dynamic';

export const POST = async (_request: Request) => {
  try {
    setSentryServiceTag('visitor');
    await clearVisitorMessages();

    return NextResponse.json({});
  } catch (error) {
    Sentry.captureException(error);
    logger.error('Error during clear visitor messages stats');
  }
};
