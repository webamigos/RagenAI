import { NextResponse } from 'next/server';

import { createMessageSchema } from '../../contracts/Message';
import { createThread, getThread } from '../../lib/services/thread';

export const POST = async (request: Request) => {
  const requestData = await createMessageSchema.safeParseAsync(
    await request.json()
  );
  if (!requestData.success) {
    return NextResponse.json(requestData.error.format(), { status: 400 });
  }

  const prompt = requestData.data.prompt;

  // TODO: below step can be used for initiating new thread
  const threadPublicId = '';
  const thread = threadPublicId ? getThread(threadPublicId) : createThread();

  return NextResponse.json({ status: 'ok' });

  // StreamingTextResponse(OpenAIStream(completions))
};
