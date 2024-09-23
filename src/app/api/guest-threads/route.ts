import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
import { createNewOpenAIThread } from '../../lib/services/thread';

export const dynamic = 'force-dynamic';

export const POST = async () => {
  try {
    const threadResult = await createNewOpenAIThread();

    return NextResponse.json(threadResult, { status: StatusCodes.CREATED });
  } catch {
    return NextResponse.json(
      { error: 'Cannot create guest thread' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
