import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
import { auth } from '@clerk/nextjs/server';

import { createMessageSchema } from '../../../contracts/Message';
import { sendForModeration } from '../../../lib/services/moderation';
import { fetchMessagesFromDb } from '../../../lib/services/message';
import {
  setSentryContext,
  setSentryServiceTag,
  setSentryUserId,
} from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

type Params = {
  params: { threadId: string };
};

/**
 * Send new message from client
 * @param request
 * @param param1
 * @returns
 */
export const POST = async (request: Request) => {
  try {
    setSentryServiceTag('messages');
    const requestData = await createMessageSchema().safeParseAsync(
      await request.json()
    );

    if (!requestData.success) {
      return NextResponse.json(requestData.error.format(), { status: 400 });
    }

    const prompt = requestData.data.prompt;

    const moderationResult = await sendForModeration(prompt);

    if (moderationResult.isFlagged) {
      return NextResponse.json(
        { error: 'Bad message' },
        { status: StatusCodes.BAD_REQUEST }
      );
    }
  } catch (e) {
    logger.error({ err: e }, 'Error sending message');
  }
};

export const GET = async (_request: Request, { params }: Params) => {
  try {
    const { userId } = auth();
    if (!userId) {
      throw new Error('Invalid user id');
    }

    const threadPublicId = params.threadId[0];
    const visitorId = params.threadId[1];

    setSentryServiceTag('messages');
    setSentryUserId(visitorId);
    setSentryContext('THREAD_ID', threadPublicId);

    // 🚨 what if someone from outside organization somehow will with get thread id
    // and then will use /messages/{threadId} endpoint?
    const messages = await fetchMessagesFromDb(threadPublicId, visitorId);
    return NextResponse.json(messages);
  } catch (e) {
    logger.error({ err: e }, 'Failed fetching messages');
    return NextResponse.json(
      { error: 'Failed fetching messages' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
