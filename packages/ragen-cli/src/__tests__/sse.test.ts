import { describe, expect, it } from 'vitest';

import { sseData } from '../sse';

function body(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(typeof c === 'string' ? encoder.encode(c) : c);
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const out: string[] = [];
  for await (const data of sseData(stream)) {
    out.push(data);
  }
  return out;
}

describe('sseData', () => {
  it('yields each event’s data, however the network splits the body', async () => {
    await expect(
      collect(body(['data: {"text":"Hel', 'lo"}\n', '\ndata: [DONE]\n\n'])),
    ).resolves.toEqual(['{"text":"Hello"}', '[DONE]']);
  });

  it('keeps a multi-byte character split across chunks whole', async () => {
    const bytes = new TextEncoder().encode('data: {"text":"żółw"}\n\n');
    // Cut inside "ż", a two-byte character.
    await expect(
      collect(body([bytes.slice(0, 16), bytes.slice(16)])),
    ).resolves.toEqual(['{"text":"żółw"}']);
  });

  it('accepts CRLF line endings and ignores non-data lines', async () => {
    await expect(
      collect(body([': ping\r\nevent: x\r\ndata: a\r\n\r\n'])),
    ).resolves.toEqual(['a']);
  });
});
