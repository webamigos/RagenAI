import { NextResponse } from 'next/server';

import { clearVisitorMessages } from '../../../lib/services/visitor';
import { logger } from '../../../lib/utils/logger';

export const dynamic = 'force-dynamic';

export const POST = async (_request: Request) => {
  try {
    await clearVisitorMessages();

    return NextResponse.json({});
  } catch (error) {
    logger.error({ err: error }, 'Error during clear visitor messages stats');
  }
};
