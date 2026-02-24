import { NextResponse } from 'next/server';

import {
  getLast24hVisitorMessages,
  getUserThreads,
} from '../../../lib/services/visitor';
import { logger } from '../../../lib/utils/logger';

type Params = {
  params: Promise<{ publicId: string }>;
};

export const dynamic = 'force-dynamic';

export const GET = async (_request: Request, { params }: Params) => {
  const { publicId } = await params;

  try {
    const visitorMessages = await getLast24hVisitorMessages(publicId);
    const userThreads = await getUserThreads(publicId);
    return NextResponse.json({ messages: visitorMessages, userThreads });
  } catch (error) {
    logger.error({ err: error }, 'Error during fetch visitor messages stats');
    return NextResponse.json({});
  }
};
