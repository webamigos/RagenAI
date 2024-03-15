// import EventEmitter from 'eventemitter2';
import { Redis } from 'ioredis';

// const isDev = process.env.NODE_ENV === 'development';
// TODO: might broke build on local machine?
// export const runtime = isDev ? 'nodejs' : 'edge';
// export const config = {
//   runtime: 'edge',
// };
// This is required to enable streaming
export const dynamic = 'force-dynamic';

// export const config = {
//   api: {
//     externalResolver: true,
//   },
// }; // this is important to avoid the 'API resolved without sending a response for /api/test_sse, this may result in stalled requests.' warning

const EVENT_NAME = 'salesyy-event';

const redis = new Redis(process.env.REDIS_URL!);

redis.subscribe('assistant-response', 'my-channel-2', (err, count) => {
  if (err) {
    // Just like other commands, subscribe() can fail for some reasons,
    // ex network issues.
    console.error('Failed to subscribe: %s', err.message);
  } else {
    // `count` represents the number of channels this client are currently subscribed to.
    console.log(
      `Subscribed successfully! This client is currently subscribed to ${count} channels.`
    );
  }
});

export async function GET() {
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // writer.write(encoder.encode('Hello there....'));
  writer.write(`event: init\ndata: ${JSON.stringify({ status: 'ok' })}\n\n`);

  try {
    // const stream = new EventEmitter();

    // stream.on('channel', function (event, data) {
    // res.write(
    //   `event: ${event}\ndata: ${JSON.stringify({ counter: data })}\n\n`
    // ); // <- the format here is important!
    // writer.write(`event: message\ndata: ${data}\n\n`); // <- the format here is important!
    // });

    redis.on('message', (channel: string, message: string) => {
      console.log(`get ${message} on ${channel}`);
      // stream.emit('channel', EVENT_NAME, message);
      writer.write(`event: message\ndata: ${message}\n\n`); // <- the format here is important!
    });

    redis.on('close', () => writer.close());
  } catch (error) {
    console.error('An error occurred', error);
    writer.write(encoder.encode('An error occurred during request'));
    writer.close();
  }

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Content-Encoding': 'none',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
