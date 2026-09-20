import { describe, it, expect, vi } from 'vitest';
import { createOutputStage, type ResolvedGuardrail } from '@ragenai/guardrails';

import { mapFullStream, textOfStream } from '../stream-mapper';

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
    ({
      mode: 'window',
      stage: createOutputStage(
        rules,
        { record: vi.fn(), onBudgetExhausted: vi.fn() },
        { windowChars },
      ),
    }) as const;

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

  it('holds a tool call until the text it came after has been released', async () => {
    // Two wrong versions this distinguishes. Emitted as it arrives, the call
    // is the *first* part of the stream, ahead of a sentence the reader has
    // not seen. Emitted as soon as any text is released, it gets past the one
    // character the window let go of and still precedes the rest of 'before'.
    //
    // What it does not assert is that the call comes before 'after'. Both
    // leave in the same release, and splitting a released chunk at the call's
    // position cannot be done honestly once a MASK rule has changed the
    // text's length. Never early; at most one release late.
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
    const toolAt = types.indexOf('tool-call');
    const textBeforeTheCall = results
      .slice(0, toolAt)
      .filter((part) => (part as { type: string }).type === 'text-delta')
      .map((part) => (part as { textDelta: string }).textDelta)
      .join('');

    expect(toolAt).toBeGreaterThan(-1);
    expect(textBeforeTheCall).toContain('before');
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

/**
 * The text view, which is what every non-streaming surface reads.
 *
 * `textStream` used to be the AI SDK's own and never met the window, so an
 * output rule applied to whichever surfaces happened to read `fullStream` —
 * the panel and the widget — and to no other. Five call sites across two apps
 * were in that state, and nothing anywhere said so.
 */
describe('textOfStream', () => {
  it('yields the text of a mapped stream and nothing else', async () => {
    const text = await collectStream(
      textOfStream(
        mapFullStream(
          createMockStream([
            { type: 'text-delta', text: 'one ' },
            { type: 'tool-call', toolCallId: 't1', toolName: 'x', input: {} },
            { type: 'text-delta', text: 'two' },
          ]),
        ),
      ),
    );

    expect(text.join('')).toBe('one two');
  });

  it('throws when a rule refused the answer, rather than ending quietly', async () => {
    // A string iterator has nowhere to put "and the reason it stopped is a
    // rule". A caller that took the end for the end of the answer would
    // persist the text it had, which is the one outcome the rule exists to
    // prevent — and an ended iterator is the easiest thing in the world to
    // treat as a finished answer.
    const stage = createOutputStage(
      [
        {
          publicId: 'rule-9',
          organizationId: null,
          key: null,
          name: 'No secrets',
          kind: 'PATTERN',
          stage: 'OUTPUT',
          action: 'BLOCK',
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
        } as unknown as ResolvedGuardrail,
      ],
      { record: vi.fn(), onBudgetExhausted: vi.fn() },
      { windowChars: 8 },
    );

    const text = textOfStream(
      mapFullStream(
        createMockStream([
          { type: 'text-delta', text: 'the key is hun' },
          { type: 'text-delta', text: 'ter2' },
        ]),
        { mode: 'window', stage },
      ),
    );

    await expect(collectStream(text)).rejects.toMatchObject({
      code: 'guardrail-blocked',
      guardrailPublicId: 'rule-9',
    });
  });
});

/**
 * The buffered mode, which is what a judged output rule turns a turn into.
 *
 * The window and this share a funnel and nothing else: one releases text as it
 * goes, the other holds every word until a model has read the answer. A caller
 * that treated the second as "the window, plus waiting" would stream half an
 * answer before finding out.
 */
describe('mapFullStream in buffered mode', () => {
  const bufferedTo = (
    verdict: { text: string; blockedBy?: ResolvedGuardrail },
    seen?: (text: string) => void,
  ) =>
    ({
      mode: 'buffered',
      evaluate: (text: string) => {
        seen?.(text);
        return Promise.resolve(verdict);
      },
    }) as const;

  it('releases nothing until the answer is finished, then all of it', async () => {
    let judgedText = '';
    const results = await collectStream(
      mapFullStream(
        createMockStream([
          { type: 'text-delta', text: 'one ' },
          { type: 'text-delta', text: 'two ' },
          { type: 'text-delta', text: 'three' },
        ]),
        bufferedTo({ text: 'one two three' }, (t) => {
          judgedText = t;
        }),
      ),
    );

    // The judge saw the whole answer, and the reader gets it as one delta —
    // splitting it back into the provider's chunks would only pretend the
    // answer had streamed.
    expect(judgedText).toBe('one two three');
    expect(results).toEqual([
      { type: 'text-delta', textDelta: 'one two three' },
    ]);
  });

  it('releases what the evaluator returned, not what the model said', async () => {
    const results = await collectStream(
      mapFullStream(
        createMockStream([{ type: 'text-delta', text: 'the key is hunter2' }]),
        bufferedTo({ text: 'the key is [[redacted:secrets]]' }),
      ),
    );

    expect(results).toEqual([
      { type: 'text-delta', textDelta: 'the key is [[redacted:secrets]]' },
    ]);
  });

  it('emits a violation and no text at all when a rule refused the answer', async () => {
    const blocking = {
      publicId: 'policy-9',
      key: null,
      name: 'No competitor pricing',
    } as unknown as ResolvedGuardrail;

    const results = await collectStream(
      mapFullStream(
        createMockStream([
          { type: 'text-delta', text: 'their price is ' },
          { type: 'text-delta', text: '12 zloty' },
        ]),
        bufferedTo({ text: 'their price is 12 zloty', blockedBy: blocking }),
      ),
    );

    expect(results).toEqual([
      {
        type: 'guardrail-violation',
        guardrailPublicId: 'policy-9',
        guardrailName: 'No competitor pricing',
      },
    ]);
    expect(JSON.stringify(results)).not.toContain('12 zloty');
  });

  it('passes a tool call straight through as it happens', async () => {
    // No text is leaving around it, so there is nothing to keep it in step
    // with — holding it back would only make it arrive later for no reason.
    const results = await collectStream(
      mapFullStream(
        createMockStream([
          { type: 'text-delta', text: 'checking' },
          {
            type: 'tool-call',
            toolCallId: 't1',
            toolName: 'search',
            input: {},
          },
          { type: 'text-delta', text: ' done' },
        ]),
        bufferedTo({ text: 'checking done' }),
      ),
    );

    const types = results.map((part) => (part as { type: string }).type);
    expect(types).toEqual(['tool-call', 'text-delta']);
  });
});
