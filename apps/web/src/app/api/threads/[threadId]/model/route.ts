import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ threadId: string }>;
};

const updateModelSchema = z.object({
  model: z.string().nullable(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 401 },
      );
    }

    const userId = session.user.id;

    const body = await request.json();
    const { model } = updateModelSchema.parse(body);

    // Update thread model
    const updatedThread = await db.thread.update({
      where: {
        id: threadId,
        organizationId: orgId,
        OR: [
          {
            userId: userId,
          },
          {
            visitorId: userId,
          },
        ],
      },
      data: {
        preferredModel: model,
      },
      select: {
        id: true,
        title: true,
        preferredModel: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        thread: updatedThread,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error({ err: error, threadId }, 'Error updating thread model');

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update thread model',
      },
      { status: 500 },
    );
  }
}
