import { NextResponse } from 'next/server';

import { type MessageDto, messageSchema } from '../../contracts/MessageDto';
import { sendForModeration } from '../../lib/services/moderation';
import { askAssistant } from '../../lib/services/assistant';
import { createThread, getThread } from '../../lib/services/thread';

export const POST = async (request: Request) => {
  const requestData = await messageSchema.safeParseAsync(await request.json());
  if (!requestData.success) {
    return NextResponse.json(requestData.error.format(), { status: 400 });
  }

  const prompt = requestData.data.prompt;

  // TODO: below step can be used for initiating new thread
  const threadPublicId = '';
  const thread = threadPublicId ? getThread(threadPublicId) : createThread();

  // const threadResult =

  // const moderationResult = await sendForModeration(prompt);
  // if (moderationResult.isFlagged) {
  //   // TODO: implement
  //   return NextResponse.json({ status: '' }, { status: 400 });
  // }
  // const moderationData = moderationResult.data.results[0];

  // if (moderationData.flagged) {
  //   // TODO: implement
  //   return NextResponse.json({ status: 'flagged' }, { status: 400 });
  // }

  // await askAssistant(prompt, 'thread_OOc9fxXw08vvz4zh1ZOZxdv5');
  // await askAssistant(prompt, '820241a5-0e70-4e5c-bef4-f6bce34ec0b1');

  return NextResponse.json({ status: 'ok' });

  // StreamingTextResponse(OpenAIStream(completions))
};
