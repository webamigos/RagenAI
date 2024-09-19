import { StatusCodes } from 'http-status-codes';
import { NextResponse } from 'next/server';
import { Client } from 'langsmith';

import { logger } from '@/app/lib/utils/logger';

type Params = {
  params: { messageId: string };
};

export const POST = async (request: Request, { params }: Params) => {
  const { messageId } = params;

  try {
    const body = await request.json();
    const { feedback, runId } = body;

    if (!feedback || (feedback !== 'up' && feedback !== 'down')) {
      return NextResponse.json(
        { error: 'Invalid feedback' },
        { status: StatusCodes.BAD_REQUEST }
      );
    }
    const client = new Client({
      apiKey: process.env.LANGCHAIN_API_KEY,
    });

    await client.createFeedback(runId, 'user-score', {
      score: feedback === 'up' ? 1 : 0,
      value: 10,
    });

    return NextResponse.json({ message: 'Feedback submitted' });
  } catch (error) {
    logger.error('Error submitting feedback: %o', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
};
