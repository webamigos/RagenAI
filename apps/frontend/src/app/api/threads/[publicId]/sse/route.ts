import { Redis } from 'ioredis';

import { redisChannelPrefix } from '../../../../config';

// errors during build - probably prisma?
// export const runtime = 'edge';
export const runtime = 'nodejs';

// This is required to enable streaming
export const dynamic = 'force-dynamic';

type Params = {
  params: { publicId: string };
};

const redisSubscriber = new Redis(process.env.REDIS_DSN!);

export async function GET(_request: Request, { params }: Params) {
  const threadPublicId = params.publicId;
  const redisChannel = `${redisChannelPrefix}-${threadPublicId}`;

  const encoder = new TextEncoder();
  // Create a stream
  const customReadable = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ message: 'init' })}\n\n`)
      );

      // Subscribe to Redis updates for the key: "redisChannel"
      // In case of any error, just log it
      redisSubscriber.subscribe(redisChannel, (err) => {
        if (err) {
          console.log(err);
        }
      });
      // Listen for new posts from Redis
      redisSubscriber.on('message', (channel, message) => {
        // Send data with the response in the SSE format
        // Only send data when the channel message is reeived is same as the message is published to
        if (channel === redisChannel)
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      });
      redisSubscriber.on('end', () => {
        controller.close();
      });
    },
  });

  return new Response(customReadable, {
    // Set headers for Server-Sent Events (SSE) / stream from the server
    headers: {
      Connection: 'keep-alive',
      'Content-Encoding': 'none',
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
    },
  });
}
