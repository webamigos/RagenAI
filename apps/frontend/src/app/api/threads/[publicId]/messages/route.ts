import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { getOrCreateThread } from '../../../../lib/services/thread';
import { createMessageSchema } from '../../../../contracts/Message';
import { sendForModeration } from '../../../../lib/services/moderation';
import {
  createThreadMessage,
  fetchMessagesFromDb,
} from '../../../../lib/services/message';
import { api } from '../../../../lib/services/config';
import axios from 'axios';

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
  const requestData = await createMessageSchema.safeParseAsync(
    await request.json()
  );

  if (!requestData.success) {
    return NextResponse.json(requestData.error.format(), { status: 400 });
  }

  const threadPublicId = params.publicId;
  const prompt = requestData.data.prompt;

  const moderationResult = await sendForModeration(prompt);

  if (moderationResult.isFlagged) {
    return NextResponse.json(
      { error: 'Bad message' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }

  // get or create thread
  try {
    const { thread, threadEntity } = await getOrCreateThread(threadPublicId);

    // create user message
    const messageResponse = await createThreadMessage({
      prompt,
      thread,
      threadEntity,
    });

    // IMPORTANT! run in background
    // TODO: it would be better to send on pub/sub
    // const reqUrl = request.headers.get('referer')!;
    // const url = new URL(reqUrl);

    // axios.post(`${url.origin}/api/assistant/${threadPublicId}`);

    // create user message and return it to display in frontend
    return NextResponse.json(
      { message: messageResponse },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (e) {
    console.log('processing error: ', e);
    return NextResponse.json(
      { error: 'Problem during processing' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};

export const GET = async (_request: Request, { params }: Params) => {
  const threadPublicId = params.publicId;

  try {
    const messages = await fetchMessagesFromDb(threadPublicId);

    return NextResponse.json(messages);
  } catch (e) {
    console.log(e);
    return NextResponse.json(
      { error: 'Failed fetching messages' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
