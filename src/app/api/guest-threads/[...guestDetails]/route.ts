import { NextRequest } from 'next/server';

import { logger } from '../../../lib/utils/logger';

import { setSentryClerkOrganizationTag } from '@/app/lib/services/sentry';
import { setSentryServiceTag } from '@/app/lib/services/sentry';
import { decodeKey } from '@/app/[locale]/(marketing)/generate-access-key/actions/generate-key';
import { createMessageSchema } from '@/app/contracts/Message';
import { streamEvents } from '../../threads/services/assistant-stream';
import { AssistantMode } from '@/app/contracts/Assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: { guestDetails: string[] };
};

// TODO: a lot duplication with src/app/api/threads/[publicThreadId]/route.ts
// the most difference is creating initializePublicRagChain instead of initializeRagChain
export async function POST(request: NextRequest, { params }: Params) {
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

    return streamEvents({
      publicThreadId,
      userMessage: parsedData,
      orgId,
      mode: AssistantMode.PUBLIC,
    });
  } catch (error) {
    logger.error(
      { err: error },
      'Unexpected error in thread stream GET handler'
    );
    return new Response('Internal Server Error', { status: 500 });
  }
}
