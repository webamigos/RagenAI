import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { askAssistant } from '../../../lib/services/assistant';

export const dynamic = 'force-dynamic';

type Params = {
  params: { publicId: string };
};

export const POST = async (_request: Request, { params }: Params) => {
  const publicThreadId = params.publicId;

  try {
    await askAssistant(publicThreadId, _request);

    // create user message and return it to display in frontend
    return NextResponse.json({});
  } catch (e) {
    console.log('Assistant processing error: ', e);
    return NextResponse.json(
      { error: 'Problem during processing' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
