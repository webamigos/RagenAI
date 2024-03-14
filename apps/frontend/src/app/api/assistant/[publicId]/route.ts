import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { askAssistant } from '../../../lib/services/assistant';

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
  const publicThreadId = params.publicId;

  try {
    const assistantResponse = await askAssistant(publicThreadId);

    // create user message and return it to display in frontend
    return NextResponse.json(
      { message: assistantResponse },
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
