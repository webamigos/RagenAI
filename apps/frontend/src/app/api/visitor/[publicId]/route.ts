import { NextResponse } from 'next/server';

import { getLast24hVisitorMessages } from '../../../lib/services/visitor';
import { logger } from '../../../lib/utils/logger';

type Params = {
  params: { publicId: string };
};

export const dynamic = 'force-dynamic';

export const GET = async (_request: Request, { params }: Params) => {
  const publicId = params.publicId;

  try {
    const visitorMessages = await getLast24hVisitorMessages(publicId);
    return NextResponse.json({ messages: visitorMessages });
  } catch (error) {
    logger.error('Error during fetch visitor messages stats');
    return NextResponse.json({});
  }
};
