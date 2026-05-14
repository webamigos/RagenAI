import { type NextRequest } from 'next/server';

import { getSession } from '@/lib/auth-guards';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import {
  registerClient,
  unregisterClient,
} from '@/app/lib/services/notifications/sse-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const [session, orgId] = await Promise.all([
    getSession(),
    getOrgIdFromAuth(),
  ]);

  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!orgId) {
    return new Response('No active organization', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const handle = registerClient({
        userId: session.user.id,
        organizationId: orgId,
        controller,
        encoder,
      });

      // Send initial keep-alive
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Keep-alive every 30s
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch (error) {
          logger.warn('SSE keep-alive failed, removing client: %o', error);
          clearInterval(keepAlive);
          unregisterClient(handle);
        }
      }, 30_000);

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        unregisterClient(handle);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
