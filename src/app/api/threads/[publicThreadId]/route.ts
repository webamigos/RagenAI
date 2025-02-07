import { NextRequest } from 'next/server';

import { logger } from '../../../lib/utils/logger';
import { getAuth } from '@clerk/nextjs/server';
import { setSentryClerkOrganizationTag } from '@/app/lib/services/sentry';
import { setSentryServiceTag } from '@/app/lib/services/sentry';
import { ChatType, createMessageSchema } from '@/app/contracts/Message';
import { streamEvents } from '@/app/api/threads/services/assistant-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: { publicThreadId: string };
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { orgId, userId } = getAuth(request);
    setSentryServiceTag('threads');
    if (!orgId) {
      throw new Error('Unauthorized');
    }
    setSentryClerkOrganizationTag(orgId);

    const { publicThreadId } = params;
    const chatType = request?.nextUrl?.searchParams.get('mode');
    const filteredMode =
      chatType === ChatType.CONVERSATION ? ChatType.CONVERSATION : ChatType.RAG;

    const body = await request.json();
    const parsedData = createMessageSchema.parse(body);

    return streamEvents({
      publicThreadId,
      userMessage: parsedData,
      orgId,
      mode: 'internal',
      userId,
      filteredMode,
    });
  } catch (error) {
    logger.error(
      { err: error },
      'Unexpected error in thread stream GET handler'
    );
    return new Response('Internal Server Error', { status: 500 });
  }
}
