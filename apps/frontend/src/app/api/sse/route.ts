import EventEmitter from 'events';

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const runtime = 'nodejs';
// This is required to enable streaming
export const dynamic = 'force-dynamic';

export async function GET() {
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  writer.write(encoder.encode('Vercel is a platform for....'));

  writer.write(encoder.encode('Second message....'));
  // writer.close();

  const parsed = 'sth';
  writer.write(encoder.encode(`${parsed}`));

  const stream = new EventEmitter();

  let counter = 0;

  // message which could be send to channel (eg. response from assistant)
  stream.on('channel', function (event, data) {
    //res.write(JSON.stringify({ counter: data })); // NOTE: this DOES NOT work
    writer.write(
      `event: ${event}\ndata: ${JSON.stringify({ counter: data })}\n\n`
    ); // <- the format here is important!
  });

  // here is just generating messages and sending them on channel
  for (let i = 0; i < 10; ++i) {
    stream.emit('channel', 'salesyy-event', counter); // the event name here must be the same as in the EventSource in frontend
    console.log('update counter', counter);
    counter++;
    await delay(1000);
  }

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
