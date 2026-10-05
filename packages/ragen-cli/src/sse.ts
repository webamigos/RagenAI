/**
 * The `data:` payloads of a server-sent-events body, in order.
 *
 * Only what `/v1/chat` sends is handled — `data:` lines, events separated by
 * a blank line — but chunk boundaries are not trusted: the network splits a
 * body wherever it likes, including inside a line or a multi-byte character,
 * so this buffers until an event is complete.
 */
export async function* sseData(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) {
        yield data;
      }
    }
    if (done) {
      return;
    }
  }
}
