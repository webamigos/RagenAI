import { describe, it, expect } from 'vitest';
import { mapFullStream } from '../stream-mapper';

async function* createMockStream(
  parts: { type: string; [key: string]: unknown }[],
) {
  for (const part of parts) {
    yield part;
  }
}

async function collectStream(
  stream: AsyncIterable<unknown>,
): Promise<unknown[]> {
  const results: unknown[] = [];
  for await (const item of stream) {
    results.push(item);
  }
  return results;
}

describe('mapFullStream', () => {
  it('passes through text-delta events', async () => {
    const stream = mapFullStream(
      createMockStream([{ type: 'text-delta', text: 'hello' }]),
    );
    const results = await collectStream(stream);
    expect(results).toEqual([{ type: 'text-delta', textDelta: 'hello' }]);
  });

  it('passes through reasoning events', async () => {
    const stream = mapFullStream(
      createMockStream([
        { type: 'reasoning-start', id: 'r1' },
        { type: 'reasoning-delta', id: 'r1', text: 'thinking...' },
        { type: 'reasoning-end', id: 'r1' },
      ]),
    );
    const results = await collectStream(stream);
    expect(results).toEqual([
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: 'thinking...' },
      { type: 'reasoning-end', id: 'r1' },
    ]);
  });

  it('strips __thought__ suffix from tool-call IDs', async () => {
    const stream = mapFullStream(
      createMockStream([
        {
          type: 'tool-call',
          toolCallId:
            'call_abc123__thought__CiMBjz1rX0NqYqoPwXuUAOldefAvMPtxG/CQD4Zl5Hms82GA8Q==',
          toolName: 'search',
          input: { query: 'test' },
        },
      ]),
    );
    const results = await collectStream(stream);
    expect(results).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call_abc123',
        toolName: 'search',
        args: { query: 'test' },
      },
    ]);
  });

  it('strips __thought__ suffix from tool-result IDs', async () => {
    const stream = mapFullStream(
      createMockStream([
        {
          type: 'tool-result',
          toolCallId: 'call_abc123__thought__longbase64data==',
          toolName: 'search',
          output: { results: [] },
        },
      ]),
    );
    const results = await collectStream(stream);
    expect(results).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'call_abc123',
        toolName: 'search',
        result: { results: [] },
      },
    ]);
  });

  it('preserves tool-call IDs without __thought__ suffix', async () => {
    const stream = mapFullStream(
      createMockStream([
        {
          type: 'tool-call',
          toolCallId: 'call_309c25b6cb7a4eb0b2dedae79be3',
          toolName: 'search',
          input: { query: 'test' },
        },
      ]),
    );
    const results = await collectStream(stream);
    expect(results).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call_309c25b6cb7a4eb0b2dedae79be3',
        toolName: 'search',
        args: { query: 'test' },
      },
    ]);
  });

  it('ignores unknown event types', async () => {
    const stream = mapFullStream(
      createMockStream([
        { type: 'source', data: 'irrelevant' },
        { type: 'text-delta', text: 'hello' },
        { type: 'finish', data: 'done' },
      ]),
    );
    const results = await collectStream(stream);
    expect(results).toEqual([{ type: 'text-delta', textDelta: 'hello' }]);
  });

  it('prefers input over args for tool-call events (AI SDK v6)', async () => {
    const stream = mapFullStream(
      createMockStream([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'search',
          input: { query: 'from-input' },
          args: { query: 'from-args' },
        },
      ]),
    );
    const results = await collectStream(stream);
    expect(results).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'search',
        args: { query: 'from-input' },
      },
    ]);
  });

  it('falls back to args when input is undefined', async () => {
    const stream = mapFullStream(
      createMockStream([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'search',
          args: { query: 'from-args' },
        },
      ]),
    );
    const results = await collectStream(stream);
    expect(results).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'search',
        args: { query: 'from-args' },
      },
    ]);
  });
});
