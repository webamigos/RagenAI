import { NextResponse } from 'next/server';

import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import {
  brainAssistantTurnSchema,
  type BrainAssistantEvent,
} from '@/features/brain-assistant/contracts/brain-assistant.types';
import { runBrainAssistantTurnCommand } from '@/features/brain-assistant/services/commands/run-brain-assistant-turn-command';
import { getActiveTeamIdFromCookie } from '@/features/teams/utils/active-team-cookie';

export const dynamic = 'force-dynamic';

/**
 * One turn of the operator's assistant (spec A3), streamed as newline-
 * delimited JSON — one `BrainAssistantEvent` per line.
 *
 * The gate is Brain's own plus the `brainAssistant` key, and the answer to
 * anyone else is the 404 every Brain route gives, so the route does not
 * confirm the feature exists. Organization, person and write access come from
 * the session; the body carries only the question, the screen and which
 * conversation it continues.
 */
export async function POST(request: Request) {
  const access = await getBrainAccessQuery();
  const userId = access?.assistant ? await getCurrentUserId() : null;
  if (!access?.assistant || !userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-input' }, { status: 400 });
  }
  const parsed = brainAssistantTurnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid-input' }, { status: 400 });
  }

  const events = runBrainAssistantTurnCommand({
    orgId: access.orgId,
    userId,
    canWrite: access.canWrite,
    activeTeamId: await getActiveTeamIdFromCookie(),
    threadId: parsed.data.threadId,
    question: parsed.data.question,
    screen: parsed.data.screen,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      } catch (error) {
        logger.error(
          { errorName: error instanceof Error ? error.name : typeof error },
          'Brain assistant stream failed',
        );
        const failure: BrainAssistantEvent = { type: 'error', code: 'unknown' };
        controller.enqueue(encoder.encode(`${JSON.stringify(failure)}\n`));
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
