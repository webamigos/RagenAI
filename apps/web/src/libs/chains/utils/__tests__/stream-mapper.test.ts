import { describe, it, expect, vi } from 'vitest';
import { createOutputStage, type ResolvedGuardrail } from '@ragenai/guardrails';

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

/**
 * The output window, through the funnel that carries it.
 *
 * The window itself is `packages/guardrails`' to test, and is. What is only
 * testable here is the wiring: that a block ends the stream rather than
 * shortening it, that the masked text is what goes out, and that the parts
 * which are not text keep their place relative to text the window is holding.
 */
describe('mapFullStream with an output guardrail window', () => {
  const rule = (over: Partial<ResolvedGuardrail> = {}): ResolvedGuardrail =>
    ({
      publicId: 'rule-1',
      organizationId: null,
      key: null,
      name: 'Secrets',
      description: null,
      kind: 'PATTERN',
      stage: 'OUTPUT',
      action: 'LOG',
      enabled: true,
      severity: 'warn',
      pattern: 'hunter2',
      patternIsRegex: false,
      threshold: null,
      isPlatformRule: true,
      sources: {
        enabled: 'platform-rule',
        action: 'platform-rule',
        threshold: 'platform-rule',
      },
      ...over,
    }) as ResolvedGuardrail;

  const stageFor = (rules: ResolvedGuardrail[], windowChars = 4) =>
    createOutputStage(
      rules,
      { record: vi.fn(), onBudgetExhausted: vi.fn() },
      { windowChars },
    );

  it('is the iterator it has always been when there is no stage', async () => {
    const results = await collectStream(
      mapFullStream(
        createMockStream([{ type: 'text-delta', text: 'hunter2' }]),
        undefined,
      ),
    );

    expect(results).toEqual([{ type: 'text-delta', textDelta: 'hunter2' }]);
  });

  it('masks what a MASK rule matched', async () => {
    const results = await collectStream(
      mapFullStream(
        createMockStream([
          { type: 'text-delta', text: 'the key is hun' },
          { type: 'text-delta', text: 'ter2 ok' },
        ]),
        stageFor([rule({ action: 'MASK' })]),
      ),
    );

    const text = results
      .filter(
        (part): part is { type: 'text-delta'; textDelta: string } =>
          (part as { type: string }).type === 'text-delta',
      )
      .map((part) => part.textDelta)
      .join('');

    expect(text).toBe('the key is [[redacted:secrets]] ok');
  });

  it('ends the stream on a BLOCK rule, and says which rule it was', async () => {
    const results = await collectStream(
      mapFullStream(
        createMockStream([
          { type: 'text-delta', text: 'the key is hun' },
          { type: 'text-delta', text: 'ter2' },
          { type: 'text-delta', text: ' and here is more' },
          { type: 'tool-call', toolCallId: 't1', toolName: 'send', input: {} },
        ]),
        stageFor([
          rule({ action: 'BLOCK', name: 'No secrets', publicId: 'rule-9' }),
        ]),
      ),
    );

    // Nothing after the violation, and nothing before it that contains the
    // match: a shortened answer would be a partial answer, and the caller
    // would store it.
    expect(results.at(-1)).toEqual({
      type: 'guardrail-violation',
      guardrailPublicId: 'rule-9',
      guardrailName: 'No secrets',
    });
    expect(JSON.stringify(results)).not.toContain('hunter2');
    expect(JSON.stringify(results)).not.toContain('and here is more');
  });

  it('holds a tool call behind the text it came after', async () => {
    // The window is wider than 'before', so nothing has been released when
    // the tool call arrives. Emitted straight away it would be the *first*
    // part of the stream — ahead of text the reader has not been shown yet —
    // and a transcript would have the call happening before the sentence that
    // led to it.
    const results = await collectStream(
      mapFullStream(
        createMockStream([
          { type: 'text-delta', text: 'before' },
          {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'search',
            input: {},
          },
          { type: 'text-delta', text: 'after' },
        ]),
        stageFor([rule()], 10),
      ),
    );

    const types = results.map((part) => (part as { type: string }).type);
    expect(types[0]).toBe('text-delta');
    expect(types.indexOf('tool-call')).toBe(1);
    expect(types.lastIndexOf('text-delta')).toBeGreaterThan(1);
  });

  it('emits a tool call straight away when the window is holding nothing', async () => {
    const results = await collectStream(
      mapFullStream(
        createMockStream([
          {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'search',
            input: {},
          },
          { type: 'text-delta', text: 'answer' },
        ]),
        stageFor([rule()]),
      ),
    );

    expect((results[0] as { type: string }).type).toBe('tool-call');
  });
});
