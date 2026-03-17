import { type NextRequest } from 'next/server';

import { getSession } from '@/lib/auth-guards';
import { logger } from '@/app/lib/utils/logger';
import { subscribe } from '@/app/lib/services/notifications/sse-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SSEClient {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
}

function broadcastToClients(
  clients: Set<SSEClient>,
  event: string,
  data: unknown,
) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    try {
      client.controller.enqueue(client.encoder.encode(payload));
    } catch (error) {
      logger.warn('Failed to send SSE broadcast to client: %o', error);
      clients.delete(client);
    }
  }
}

const clients = new Set<SSEClient>();

subscribe(({ event, data }) => {
  broadcastToClients(clients, event, data);
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const client: SSEClient = { controller, encoder };
      clients.add(client);

      // Send initial keep-alive
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Keep-alive every 30s to prevent proxy/browser timeouts
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch (error) {
          logger.warn('SSE keep-alive failed, removing client: %o', error);
          clearInterval(keepAlive);
          clients.delete(client);
        }
      }, 30_000);

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        clients.delete(client);
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
