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

    if (!runId) {
      return NextResponse.json(
        { error: 'Invalid runId' },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    const client = new Client({
      apiKey: process.env.LANGCHAIN_API_KEY,
    });

    await client.createFeedback(runId, 'user-score', {
      score: feedback === 'up' ? 1 : 0,
    });

    return NextResponse.json({ message: 'Feedback submitted' });
  } catch (error) {
    logger.error('Error submitting feedback:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
};
