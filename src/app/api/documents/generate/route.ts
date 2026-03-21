import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { ragenAuthClient } from '@/libs/ragen-vault/client';
import { Workflow } from '@/features/documents/contracts/document.types';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GOOGLE_DRIVE_PROVIDER = 'GOOGLE_DRIVE';

const requestSchema = z.object({
  templateName: z.enum(['workshop-summary']),
  rawInput: z.record(z.unknown()),
  clientName: z.string().min(1).max(200),
  driveFolderId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();

  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }

  let body: z.infer<typeof requestSchema>;
  try {
    const raw = await request.json();
    body = requestSchema.parse(raw);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid request body',
        details: error instanceof z.ZodError ? error.errors : undefined,
      },
      { status: 400 },
    );
  }

  // Fetch Google Drive access token from ragen-token-vault
  const customerId = `${orgId}:${userId}:${GOOGLE_DRIVE_PROVIDER.toLowerCase()}`;
  let driveAccessToken: string;
  try {
    const tokenData = await ragenAuthClient.getToken(
      customerId,
      GOOGLE_DRIVE_PROVIDER,
    );
    driveAccessToken = tokenData.accessToken;
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch Google Drive token');
    return NextResponse.json(
      {
        error:
          'Google Drive not connected. Please connect Google Drive in Settings > Connectors.',
      },
      { status: 400 },
    );
  }

  // Start Temporal workflow
  const workflowId = `docgen-${orgId}-${nanoid()}`;
  try {
    const client = getTemporalClient();
    await client.workflow.start(Workflow.GENERATE_DOCUMENT, {
      workflowId,
      taskQueue: TASK_QUEUE_NAME,
      args: [
        {
          templateName: body.templateName,
          rawInput: body.rawInput,
          clientName: body.clientName,
          driveFolderId: body.driveFolderId,
          driveAccessToken,
          orgId,
          userId,
          userEmail: session.user.email,
        },
      ],
    });
  } catch (error) {
    logger.error(
      { err: error },
      'Failed to start document generation workflow',
    );
    return NextResponse.json(
      { error: 'Failed to start document generation' },
      { status: 500 },
    );
  }

  return NextResponse.json({ workflowId });
}
