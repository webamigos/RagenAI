import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: { publicThreadId: string };
};

const updateModelSchema = z.object({
  model: z.string().nullable(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = getAuth(request);
    setSentryServiceTag('threads.model.patch');

    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    setSentryClerkOrganizationTag(orgId);

    const { publicThreadId } = params;
    const body = await request.json();
    const { model } = updateModelSchema.parse(body);

    // Update thread model
    const updatedThread = await db.thread.update({
      where: {
        public_id: publicThreadId,
        organization_id: orgId,
        OR: [
          {
            user_id: userId,
          },
          {
            visitor_id: userId,
          },
        ],
      },
      data: {
        preferred_model: model,
      },
      select: {
        public_id: true,
        title: true,
        preferred_model: true,
        created_at: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        thread: updatedThread,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error(
      { err: error, threadId: params.publicThreadId },
      'Error updating thread model'
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
