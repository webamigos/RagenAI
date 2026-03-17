import { type NextRequest } from 'next/server';

import { subscribe } from '@/app/lib/services/notifications/sse-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SSEClient = {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
};

function broadcastToClients(
  clients: Set<SSEClient>,
  event: string,
  data: unknown,
) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    try {
      client.controller.enqueue(client.encoder.encode(payload));
    } catch {
      clients.delete(client);
    }
  }
}

const clients = new Set<SSEClient>();

subscribe(({ event, data }) => {
  broadcastToClients(clients, event, data);
});

export async function GET(request: NextRequest) {
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
        } catch {
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
