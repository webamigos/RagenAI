import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ publicThreadId: string }>;
};

const updateModelSchema = z.object({
  model: z.string().nullable(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const { publicThreadId } = await params;
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
        { status: 401 }
      );
    }

    const userId = session.user.id;
    setSentryServiceTag('threads.model.patch');
    setSentryClerkOrganizationTag(orgId);

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
      { err: error, threadId: publicThreadId },
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
