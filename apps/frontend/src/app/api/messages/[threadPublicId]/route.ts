import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { getThread } from '../../../lib/services/thread';
import { messageSchema } from '../../../contracts/MessageDto';
import { sendForModeration } from '../../../lib/services/moderation';
import { askAssistant } from '../../../lib/services/assistant';

export const dynamic = 'force-dynamic';

type Params = {
  params: { threadPublicId: string };
};

export const POST = async (request: Request, { params }: Params) => {
  const requestData = await messageSchema.safeParseAsync(await request.json());

  if (!requestData.success) {
    return NextResponse.json(requestData.error.format(), { status: 400 });
  }

  const threadPublicId = params.threadPublicId;
  const prompt = requestData.data.prompt;

  console.log({ threadPublicId, requestData });

  // TODO: moderation API - add this message to thread?
  // const moderationResult = await sendForModeration(prompt);

  // if (moderationResult.isFlagged) {
  //   return NextResponse.json(
  //     { error: 'Bad message' },
  //     { status: StatusCodes.BAD_REQUEST }
  //   );
  // }

  const assistantResponse = await askAssistant(prompt, threadPublicId);

  // const responseStream = new TransformStream();
  // const writer = responseStream.writable.getWriter();
  // const encoder = new TextEncoder();

  // await writer.write(
  //   encoder.encode(`event: message\ndata: ${assistantResponse}\n\n`)
  // );

  return NextResponse.json(
    // return new Response(
    { message: assistantResponse },
    // responseStream.readable,
    {
      headers: {
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
      },
    }
  );
  // try {
  //   const threadResult = await getThread(publicId);
  //   return NextResponse.json(threadResult);
  // } catch {
  //   return NextResponse.json(
  //     { error: 'Thread not found' },
  //     { status: StatusCodes.NOT_FOUND }
  //   );
  // }

  // StreamingTextResponse(OpenAIStream(completions))
};
