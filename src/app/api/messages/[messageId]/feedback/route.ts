import { StatusCodes } from 'http-status-codes';
import { NextResponse } from 'next/server';

import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';

type Params = {
  params: Promise<{ messageId: string }>;
};

export const POST = async (request: Request, { params }: Params) => {
  const { messageId } = await params;

  try {
    const body = await request.json();
    const { feedback } = body;

    if (!feedback || (feedback !== 'up' && feedback !== 'down')) {
      return NextResponse.json(
        { error: 'Invalid feedback' },
        { status: StatusCodes.BAD_REQUEST },
      );
    }

    const message = await db.message.findUnique({
      where: { public_id: messageId },
      select: { id: true },
    });

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: StatusCodes.NOT_FOUND },
      );
    }

    await db.message.update({
      where: { id: message.id },
      data: { rate: feedback === 'up' ? 1 : 0 },
    });

    return NextResponse.json({ message: 'Feedback submitted' });
  } catch (error) {
    logger.error({ err: error }, 'Error submitting feedback');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR },
    );
  }
};
