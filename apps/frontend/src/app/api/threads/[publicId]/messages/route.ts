import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { getThread } from '../../../../lib/services/thread';
import { messageSchema } from '../../../../contracts/MessageDto';
import { sendForModeration } from '../../../../lib/services/moderation';
import { askAssistant } from '../../../../lib/services/assistant';
import { fetchMessagesFromDb } from '../../../../lib/services/message';

export const dynamic = 'force-dynamic';

type Params = {
  params: { publicId: string };
};

/**
 * Send new message from client
 * @param request
 * @param param1
 * @returns
 */
export const POST = async (request: Request, { params }: Params) => {
  const requestData = await messageSchema.safeParseAsync(await request.json());

  if (!requestData.success) {
    return NextResponse.json(requestData.error.format(), { status: 400 });
  }

  const threadPublicId = params.publicId;
  const prompt = requestData.data.prompt;

  console.log({ threadPublicId, requestData });

  // TODO: moderation API - add this message to thread?
  const moderationResult = await sendForModeration(prompt);

  if (moderationResult.isFlagged) {
    return NextResponse.json(
      { error: 'Bad message' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }

  const assistantResponse = await askAssistant(prompt, threadPublicId);

  return NextResponse.json(
    { message: assistantResponse },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
};

export const GET = async (_request: Request, { params }: Params) => {
  const threadPublicId = params.publicId;

  try {
    const messages = await fetchMessagesFromDb(threadPublicId);

    return NextResponse.json({ messages });
  } catch (e) {
    console.log(e);
    return NextResponse.json(
      { error: 'Failed fetching messages' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
