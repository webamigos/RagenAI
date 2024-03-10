import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { getThread } from '../../../lib/services/thread';

type Params = {
  params: { publicId: string };
};

export const GET = async (_request: Request, { params }: Params) => {
  const publicId = params.publicId;

  try {
    const threadResult = await getThread(publicId);
    return NextResponse.json(threadResult);
  } catch {
    return NextResponse.json(
      { error: 'Thread not found' },
      { status: StatusCodes.NOT_FOUND }
    );
  }

  // StreamingTextResponse(OpenAIStream(completions))
};
