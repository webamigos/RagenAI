// import EventEmitter from 'eventemitter2';
import { Redis } from 'ioredis';

// const isDev = process.env.NODE_ENV === 'development';
// TODO: might broke build on local machine?
// export const runtime = isDev ? 'nodejs' : 'edge';
// export const config = {
//   runtime: 'edge',
// };

export const runtime = 'edge';

// This is required to enable streaming
export const dynamic = 'force-dynamic';

type Params = {
  params: { publicId: string };
};

// const EVENT_NAME = 'salesyy-event';

const redisSubscriber = new Redis(process.env.REDIS_DSN!);

export async function GET(_request: Request, { params }: Params) {
  const threadPublicId = params.publicId;
  const redisChannel = `assistant-response-${threadPublicId}`;

  const encoder = new TextEncoder();
  // Create a stream
  const customReadable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: init\n\n`));

      // Subscribe to Redis updates for the key: "posts"
      // In case of any error, just log it
      redisSubscriber.subscribe(redisChannel, (err) => {
        if (err) console.log(err);
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

  // const responseStream = new TransformStream();
  // const writer = responseStream.writable.getWriter();
  // const encoder = new TextEncoder();

  // const messageListener = (channel: string, message: string) => {
  //   console.log(`get ${message} on ${channel}`);
  //   // stream.emit('channel', EVENT_NAME, message);
  //   writer.write(`event: message\ndata: ${message}\n\n`); // <- the format here is important!
  // };

  // request.signal.onabort = async () => {
  //   // Close connections
  //   console.log(
  //     'Browser disconnected. Unsubscribing from Redis and closing writer.'
  //   );
  //   // redis.removeListener('message', messageListener); // Unregister Redis event listener (created using redis.on(...))
  //   await writer.ready;
  //   await writer.close();
  //   // await redis.unsubscribe(redisChannel); // Unsubscribe from Redis channels (calls redis.unsubscribe(...))
  // };

  // try {
  //   writer.write(
  //     `event: init\nevent: init\ndata: ${JSON.stringify({ status: 'ok' })}\n\n`
  //   );

  //   await redis.subscribe(redisChannel, (err, count) => {
  //     if (err) {
  //       // Just like other commands, subscribe() can fail for some reasons,
  //       // ex network issues.
  //       console.error('Failed to subscribe: %s', err.message);
  //     } else {
  //       // `count` represents the number of channels this client are currently subscribed to.
  //       console.log(
  //         `Subscribed successfully! This client is currently subscribed to ${count} channels.`
  //       );
  //     }
  //   });

  // const stream = new EventEmitter();

  // stream.on('channel', function (event, data) {
  // res.write(
  //   `event: ${event}\ndata: ${JSON.stringify({ counter: data })}\n\n`
  // ); // <- the format here is important!
  // writer.write(`event: message\ndata: ${data}\n\n`); // <- the format here is important!
  // });

  // redis.on('message', messageListener);

  // redis.on('close', () => writer.close());
  // } catch (error) {
  //   console.error('An error occurred', error);
  //   writer.write(encoder.encode('An error occurred during request'));
  //   writer.close();
  // }

  // return new Response(responseStream.readable, {
  //   headers: {
  //     'Content-Type': 'text/event-stream',
  //     Connection: 'keep-alive',
  //     'Content-Encoding': 'none',
  //     'Cache-Control': 'no-cache, no-transform',
  //   },
  // });
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
