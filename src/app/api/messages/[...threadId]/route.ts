import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { createMessageSchema } from '../../../contracts/Message';
import { sendForModeration } from '../../../lib/services/moderation';
import { fetchMessagesFromDb } from '../../../lib/services/message';

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
  const requestData = await createMessageSchema.safeParseAsync(
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
};

export const GET = async (_request: Request, { params }: Params) => {
  // const threadPublicId = params.threadId;
  const threadPublicId = params.threadId[0];
  const visitorId = params.threadId[1];

  try {
    const messages = await fetchMessagesFromDb(threadPublicId, visitorId);
    return NextResponse.json(messages);
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed fetching messages' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
