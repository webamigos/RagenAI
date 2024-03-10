import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { type MessageDto, messageSchema } from '../../contracts/MessageDto';

import { createThread, getThread } from '../../lib/services/thread';

// export const POST = async (request: Request) => {
//   const requestData = await messageSchema.safeParseAsync(await request.json());
//   if (!requestData.success) {
//     return NextResponse.json(requestData.error.format(), { status: 400 });
//   }

//   const prompt = requestData.data.prompt;

//   // TODO: below step can be used for initiating new thread
//   const threadPublicId = '';
//   const threadResult = threadPublicId ? getThread(threadPublicId) : createThread();

//   return NextResponse.json(threadResult);

//   // StreamingTextResponse(OpenAIStream(completions))
// };

export type CreateThreadDto = {
  public_id: string;
};

export const POST = async () => {
  try {
    const threadResult = await createThread();
    return NextResponse.json(threadResult, { status: StatusCodes.CREATED });
  } catch {
    return NextResponse.json(
      { error: 'Cannot create thread' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
