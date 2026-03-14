import { NextResponse, type NextRequest } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { createMessageSchema } from '@/features/messages/contracts/message.types';
import { getThreadMessagesQuery as fetchMessagesFromDb } from '@/features/messages/services/queries/get-thread-messages-query';
import { logger } from '@/app/lib/utils/logger';
import { auth } from '@/lib/auth';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import db from '@ragenai/prisma-client';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ threadId: string[] }>;
};

export const POST = async (request: NextRequest) => {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

export const GET = async (request: NextRequest, { params }: Params) => {
  try {
    const { threadId } = await params;

    // Validate threadId array
    if (!threadId || threadId.length < 2) {
      throw new Error(
        'Invalid thread ID format: expected [threadId, visitorId]',
      );
    }

    const threadPublicId = threadId[0];
    const visitorId = threadId[1];

    // Verify the thread belongs to the authenticated user's org (if logged in)
    // or validate visitor ownership for guest threads
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session?.user) {
      const orgId = await getOrgIdFromAuth();
      if (!orgId) {
        return NextResponse.json(
          { error: 'Organization not found' },
          { status: StatusCodes.FORBIDDEN },
        );
      }
      const thread = await db.thread.findFirst({
        where: { public_id: threadPublicId, organization_id: orgId },
        select: { id: true },
      });
      if (!thread) {
        return NextResponse.json(
          { error: 'Thread not found' },
          { status: StatusCodes.NOT_FOUND },
        );
      }
    }

    // The query itself validates visitor_id ownership
    const result = await fetchMessagesFromDb(threadPublicId, visitorId);
    return NextResponse.json(result);
  } catch (e) {
    logger.error(
      {
        err: e,
        errorName: (e as Error)?.name,
      },
      'Failed fetching messages',
    );
    return NextResponse.json(
      { error: 'Failed fetching messages' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR },
    );
  }
};
