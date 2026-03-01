import { type NextRequest } from 'next/server';

import { logger } from '../../../lib/utils/logger';
import { createMessageSchema } from '@/features/messages/contracts/message.types';
import { streamEvents } from '../../threads/services/assistant-stream';
import { AssistantMode } from '@/features/assistants/contracts/assistant.types';
import { getVisitorIdFromCookie } from '@/app/lib/services/cookies';
import { getPublicProjectQuery as getPublicProject } from '@/features/projects/services/queries/get-project-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{
    guestDetails: string[];
  }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  let stream: ReadableStream | undefined;

  try {
    const { guestDetails } = await params;
    const [publicThreadId, organizationAccessToken] = guestDetails;

    const projectData = await getPublicProject(organizationAccessToken);
    if (!projectData) {
      throw new Error('Project not found');
    }

    const { organizationId, projectId } = projectData;

    if (!organizationId) {
      throw new Error('Unauthorized');
    }
    const body = await request.json();
    const parsedData = createMessageSchema().parse(body);

    const visitorId = await getVisitorIdFromCookie();

    if (!visitorId) {
      throw new Error('Invalid visitor id');
    }

    stream = await streamEvents({
      publicThreadId,
      userMessage: parsedData,
      orgId: organizationId,
      projectId,
      mode: AssistantMode.PUBLIC,
      visitorId,
    });

    return new Response(stream, {
      headers: {
        Connection: 'keep-alive',
        'Content-Encoding': 'none',
        'Cache-Control': 'no-cache, no-transform',
        'Content-Type': 'text/event-stream; charset=utf-8',
      },
    });
  } catch (error) {
    logger.error(
      { err: error },
      'Unexpected error in thread stream GET handler',
    );

    if (stream) {
      stream.cancel();
    }

    return new Response('Internal Server Error', { status: 500 });
  }
}
