import { StatusCodes } from 'http-status-codes';
import { type NextRequest, NextResponse } from 'next/server';

import { logger } from '@/app/lib/utils/logger';
import { auth } from '@/lib/auth';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import db from '@ragenai/prisma-client';

type Params = {
  params: Promise<{ messageId: string }>;
};

export const dynamic = 'force-dynamic';

export const POST = async (request: NextRequest, { params }: Params) => {
  const { messageId } = await params;

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: StatusCodes.UNAUTHORIZED },
      );
    }

    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: StatusCodes.UNAUTHORIZED },
      );
    }

    const body = await request.json();
    const { feedback } = body;

    if (!feedback || (feedback !== 'up' && feedback !== 'down')) {
      return NextResponse.json(
        { error: 'Invalid feedback' },
        { status: StatusCodes.BAD_REQUEST },
      );
    }

    // Find message scoped to the user's organization via thread relationship
    const message = await db.message.findFirst({
      where: {
        publicId: messageId,
        thread: { organizationId: orgId },
      },
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
