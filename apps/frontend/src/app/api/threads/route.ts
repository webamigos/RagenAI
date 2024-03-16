import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { createThread } from '../../lib/services/thread';

export const dynamic = 'force-dynamic';

export const POST = async () => {
  try {
    const threadResult = await createThread();
    return NextResponse.json(threadResult, { status: StatusCodes.CREATED });
  } catch {
    return NextResponse.json(
      { error: 'Cannot create thread' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
