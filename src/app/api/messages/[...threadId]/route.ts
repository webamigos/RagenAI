import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
// Auth is now handled via Better Auth in middleware

import { createMessageSchema } from '@/features/messages/contracts/message.types';
import { getThreadMessagesQuery as fetchMessagesFromDb } from '@/features/messages/services/queries/get-thread-messages-query';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ threadId: string[] }>;
};

/**
 * Send new message from client
 * @param request
 * @param param1
 * @returns
 */
export const POST = async (request: Request) => {
  try {
    const requestData = await createMessageSchema().safeParseAsync(
      await request.json(),
    );

    if (!requestData.success) {
      return NextResponse.json(requestData.error.format(), { status: 400 });
    }

    const _prompt = requestData.data.prompt;
  } catch (e) {
    logger.error({ err: e }, 'Error sending message');
    return NextResponse.json(
      {
        type: 'error',
        message: 'Failed to process message',
        code: 'message-processing-error',
      },
      { status: StatusCodes.INTERNAL_SERVER_ERROR },
    );
  }
};

export const GET = async (_request: Request, { params }: Params) => {
  try {
    const { threadId } = await params;
    // TODO: Add user authentication check if needed for messages endpoint
    // For now, this endpoint might be accessed without authentication for guest threads

    // Validate threadId array
    if (!threadId || threadId.length < 2) {
      throw new Error(
        'Invalid thread ID format: expected [threadId, visitorId]',
      );
    }

    const threadPublicId = threadId[0];
    const visitorId = threadId[1];

    // 🚨 what if someone from outside organization somehow will with get thread id
    // and then will use /messages/{threadId} endpoint?
    const result = await fetchMessagesFromDb(threadPublicId, visitorId);
    return NextResponse.json(result);
  } catch (e) {
    logger.error({ err: e }, 'Failed fetching messages');
    return NextResponse.json(
      { error: 'Failed fetching messages' },
      { status: StatusCodes.BAD_REQUEST },
    );
  }
};
