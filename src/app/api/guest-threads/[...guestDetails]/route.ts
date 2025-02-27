import { NextRequest } from 'next/server';

import { logger } from '../../../lib/utils/logger';
import { setSentryClerkOrganizationTag } from '@/app/lib/services/sentry';
import { setSentryServiceTag } from '@/app/lib/services/sentry';
import { decodeKey } from '@/app/[locale]/(marketing)/generate-access-key/actions/generate-key';
import { createMessageSchema } from '@/app/contracts/Message';
import { streamEvents } from '../../threads/services/assistant-stream';
import { AssistantMode } from '@/app/contracts/Assistant';
import { getVisitorIdFromCookie } from '@/app/lib/services/cookies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: { guestDetails: string[] };
};

export async function POST(request: NextRequest, { params }: Params) {
  let stream: ReadableStream | undefined;

  try {
    const [publicThreadId, organizationAccessToken] = params.guestDetails;

    const orgId = await decodeKey(organizationAccessToken);

    setSentryServiceTag('threads');
    if (!orgId) {
      throw new Error('Unauthorized');
    }
    setSentryClerkOrganizationTag(orgId);

    const body = await request.json();
    const parsedData = createMessageSchema.parse(body);

    const visitorId = await getVisitorIdFromCookie();

    if (!visitorId) {
      throw new Error('Invalid visitor id');
    }

    stream = await streamEvents({
      publicThreadId,
      userMessage: parsedData,
      orgId,
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
      'Unexpected error in thread stream GET handler'
    );

    if (stream) {
      stream.cancel();
    }

    return new Response('Internal Server Error', { status: 500 });
  }
}
