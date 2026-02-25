import { NextRequest } from 'next/server';

import { logger } from '../../../lib/utils/logger';
import { auth } from '@/lib/auth';
import {
  ChatType,
  createMessageSchema,
} from '@/features/messages/contracts/message.types';
import { streamEvents } from '@/app/api/threads/services/assistant-stream';
import { AssistantMode } from '@/features/assistants/contracts/assistant.types';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ publicThreadId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  let stream: ReadableStream | undefined;

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      throw new Error('Unauthorized');
    }

    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      throw new Error('Organization not found');
    }

    const { publicThreadId } = await params;
    const chatType = request?.nextUrl?.searchParams.get('mode');

    const filteredMode =
      chatType === ChatType.CONVERSATION ? ChatType.CONVERSATION : ChatType.RAG;

    const body = await request.json();
    const parsedData = createMessageSchema().parse(body);

    stream = await streamEvents({
      publicThreadId,
      userMessage: parsedData,
      orgId,
      mode: AssistantMode.INTERNAL,
      filteredMode,
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
      'Unexpected error in thread stream GET handler'
    );
    if (stream) {
      stream.cancel();
    }

    return new Response('Internal Server Error', { status: 500 });
  }
}
