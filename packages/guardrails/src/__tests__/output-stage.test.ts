import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OUTPUT_WINDOW_CHARS } from '../contracts/guardrail';
import {
  createOutputStage,
  releaseBoundary,
  wholeCodePoint,
  type OutputStageDeps,
  type OutputStageEvent,
} from '../evaluator/output-stage';
import type { ResolvedGuardrail } from '../resolver/resolve';

/**
 * The output window, tested here rather than only through a runtime's funnel.
 *
 * Same argument as the input stage's suite: this is the one place that decides
 * what an output rule does, and both `apps/web` and `apps/api` will run it. A
 * suite that reached it only through one of them would leave the other's
 * behaviour resting on tests that do not mention it.
 */

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

let record: ReturnType<typeof vi.fn>;
let onBudgetExhausted: ReturnType<typeof vi.fn>;
let deps: OutputStageDeps;

beforeEach(() => {
  record = vi.fn();
  onBudgetExhausted = vi.fn();
  deps = { record, onBudgetExhausted };
});

/** Everything the stage released over a whole stream, as one string. */
const textOf = (events: readonly OutputStageEvent[]): string =>
  events
    .filter(
      (event): event is { type: 'text'; text: string } => event.type === 'text',
    )
    .map((event) => event.text)
    .join('');

const run = (
  rules: readonly ResolvedGuardrail[],
  deltas: readonly string[],
  windowChars = 4,
): OutputStageEvent[] => {
  const stage = createOutputStage(rules, deps, { windowChars });
  const events: OutputStageEvent[] = [];
  for (const delta of deltas) {
    events.push(...stage.push(delta));
  }
  events.push(...stage.flush());
  return events;
};

describe('createOutputStage', () => {
  it('passes every delta through untouched when the org has no pattern rules', () => {
    const stage = createOutputStage([], deps, {});

    expect(stage.push('one ')).toEqual([{ type: 'text', text: 'one ' }]);
    expect(stage.push('two')).toEqual([{ type: 'text', text: 'two' }]);
    expect(stage.flush()).toEqual([]);
    // Nothing is held, so nothing has to be released at the end. A stage that
    // buffered here would delay every answer in every installation that has
    // configured no output rules, which is all of them at first.
    expect(stage.held).toBe(0);
  });

  it('holds the last window of characters back until more text arrives', () => {
    const stage = createOutputStage([rule()], deps, { windowChars: 4 });

    // Ten characters in, six out: the tail could still be the start of a match.
    expect(textOf(stage.push('0123456789'))).toBe('012345');
    expect(stage.held).toBe(4);

    expect(textOf(stage.push('ab'))).toBe('67');
    expect(textOf(stage.flush())).toBe('89ab');
  });

  it('catches a match split across three deltas', () => {
    const blocking = rule({ action: 'BLOCK', pattern: 'hunter2' });
    const events = run([blocking], ['hun', 'te', 'r2'], 8);

    expect(events).toEqual([{ type: 'blocked', rule: blocking }]);
    // The point of the window: no part of the answer went out before the
    // match completed, even though no single delta contained it.
    expect(textOf(events)).toBe('');
    expect(record).toHaveBeenCalledWith({ rule: blocking });
  });

  it('catches a match as wide as the window, and misses one wider than it', () => {
    // The pair of assertions is the window's contract, and the reason
    // `validatePatternShape` refuses an output pattern that can match wider
    // than `OUTPUT_WINDOW_CHARS` instead of warning about one.
    //
    // Up to the window's width, a match is still whole in the buffer when its
    // last character arrives, so it is caught however the provider chunked the
    // answer. Past it, the match's own prefix is released before the rest
    // arrives — and a regex cannot report a partial match, so nothing pulls
    // the boundary back and nothing anywhere notices. The rule reads as
    // enabled on the page and is enforced by nothing, which is why this has to
    // be refused at save time: no runtime signal exists to raise later.
    const wide = rule({ action: 'BLOCK', pattern: 'abcdefghij' });

    const caught = run([wide], ['abcdefgh', 'ij'], 10);
    expect(caught).toEqual([{ type: 'blocked', rule: wide }]);

    record.mockClear();
    const missed = run([wide], ['abcdefgh', 'ij'], 3);
    expect(textOf(missed)).toBe('abcdefghij');
    expect(record).not.toHaveBeenCalled();
  });

  it('stops the stream once a BLOCK rule has matched', () => {
    const blocking = rule({ action: 'BLOCK', pattern: 'nope' });
    const stage = createOutputStage([blocking], deps, { windowChars: 2 });

    stage.push('all fine so far, nope');
    expect(stage.push(' and more text')).toEqual([]);
    expect(stage.flush()).toEqual([]);
  });

  it('never releases the prefix of a match that reaches into the window', () => {
    // 'hunter2' straddles the boundary: six characters are outside the window
    // and would be released by length alone, and releasing them would put
    // 'hun' on screen and mask 'ter2' afterwards.
    const stage = createOutputStage([rule({ action: 'MASK' })], deps, {
      windowChars: 4,
    });

    expect(textOf(stage.push('say hunter2'))).toBe('say ');
    expect(textOf(stage.flush())).toBe('[[redacted:secrets]]');
  });

  it('masks a match rather than releasing it, once it is final', () => {
    const events = run([rule({ action: 'MASK' })], ['my key is hunter2 ok'], 4);

    expect(textOf(events)).toBe('my key is [[redacted:secrets]] ok');
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      rule: expect.objectContaining({ publicId: 'rule-1' }),
      matchCount: 1,
    });
  });

  it('leaves the text alone for a LOG rule, and says it fired', () => {
    const events = run([rule({ action: 'LOG' })], ['my key is hunter2 ok'], 4);

    expect(textOf(events)).toBe('my key is hunter2 ok');
    expect(record).toHaveBeenCalledWith({
      rule: expect.objectContaining({ publicId: 'rule-1' }),
      matchCount: 1,
    });
  });

  it('files one event per rule for an answer it matched in several releases', () => {
    // Three matches, released in different passes as the window slides. One
    // rule fired, three times — not three rules firing, and not a count that
    // depends on how the provider chunked the answer.
    const events = run(
      [rule({ action: 'LOG' })],
      ['hunter2 a', 'aa hunter2 ', 'bbb hunter2 ccc'],
      4,
    );

    expect(textOf(events)).toBe('hunter2 aaa hunter2 bbb hunter2 ccc');
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      rule: expect.objectContaining({ publicId: 'rule-1' }),
      matchCount: 3,
    });
  });

  it('still files the rules that fired on a turn that ended in a block', () => {
    const logging = rule({ publicId: 'log-1', action: 'LOG', pattern: 'aaa' });
    const blocking = rule({
      publicId: 'block-1',
      action: 'BLOCK',
      pattern: 'nope',
    });

    run([logging, blocking], ['aaa then ', 'nope'], 2);

    // A `LOG` rule that matched before the block matched did fire, and the
    // text it saw was released. Dropping its event would make the hit counts
    // describe only the turns nobody blocked.
    expect(record).toHaveBeenCalledWith({
      rule: expect.objectContaining({ publicId: 'log-1' }),
      matchCount: 1,
    });
    expect(record).toHaveBeenCalledWith({
      rule: expect.objectContaining({ publicId: 'block-1' }),
    });
  });

  it('files a LOG rule that matched the same delta as the block', () => {
    // The spans of a blocking pass are still in the buffer, so no release has
    // counted them and none ever will. A rule whose only match was in that
    // pass would be missing from the hit counts entirely — and a `LOG` rule
    // fires on what the model produced, whether or not the reader saw it.
    const logging = rule({ publicId: 'log-1', action: 'LOG', pattern: 'aaa' });
    const blocking = rule({
      publicId: 'block-1',
      action: 'BLOCK',
      pattern: 'nope',
    });

    run([logging, blocking], ['aaa and then nope'], 2);

    expect(record).toHaveBeenCalledWith({
      rule: expect.objectContaining({ publicId: 'log-1' }),
      matchCount: 1,
    });
    expect(record).toHaveBeenCalledWith({
      rule: expect.objectContaining({ publicId: 'block-1' }),
    });
  });

  it('never releases half of a surrogate pair', () => {
    // The boundary counts UTF-16 code units and an emoji is two of them.
    // Splitting one puts a lone surrogate in the delta that goes out over SSE,
    // which renders as a replacement character on both sides of the seam — for
    // text nothing matched.
    const stage = createOutputStage([rule()], deps, { windowChars: 4 });

    const released = textOf(stage.push('a😀cde'));
    expect(released).toBe('a');
    expect(released).not.toContain('\ud83d');

    expect(released + textOf(stage.flush())).toBe('a😀cde');
  });

  it('reports a rule the budget skipped once, not once per delta', () => {
    // A zero budget skips every rule on every pass, which is what a
    // misbehaving pattern looks like from here. The report has to reach the
    // operator; fifty copies of it during one answer do not.
    const stage = createOutputStage([rule()], deps, {
      windowChars: 2,
      budgetMs: 0,
      now: () => 1_000,
    });

    stage.push('one');
    stage.push('two');
    stage.push('three');
    stage.flush();

    expect(onBudgetExhausted).toHaveBeenCalledTimes(1);
    expect(onBudgetExhausted).toHaveBeenCalledWith(
      [expect.objectContaining({ publicId: 'rule-1' })],
      0,
    );
  });

  it('does not evaluate a rule of another kind', () => {
    // `LLM_POLICY` on output buffers the whole answer and is Phase D3. A
    // policy row reaching this window must not be treated as a pattern with no
    // pattern — which matches nothing and would read as a rule that passed.
    const policy = rule({
      kind: 'LLM_POLICY',
      action: 'BLOCK',
      pattern: null,
      policy: 'Never mention a competitor.',
    });
    const stage = createOutputStage([policy], deps, { windowChars: 4 });

    expect(stage.push('a competitor')).toEqual([
      { type: 'text', text: 'a competitor' },
    ]);
    expect(stage.held).toBe(0);
    expect(record).not.toHaveBeenCalled();
  });

  it('reads a word boundary against the answer, not against the buffer', () => {
    // 'zzzz' is released before 'foo!' completes, so a rule run on the buffer
    // alone sees a string that *begins* `foo` — and `\bfoo` matches it. In
    // the answer there is no word boundary there at all. The rule fires on
    // text that does not match it, and nothing about that is visible.
    const wordBoundary = rule({
      action: 'BLOCK',
      pattern: '\\bfoo',
      patternIsRegex: true,
    });

    const events = run([wordBoundary], ['zzzzfoo', '!'], 3);

    expect(textOf(events)).toBe('zzzzfoo!');
    expect(record).not.toHaveBeenCalled();
  });

  it('still matches a word boundary that is really there', () => {
    // The mirror of the test above: dropping matches that start inside the
    // context must not drop the ones that begin in the buffer, or the whole
    // assertion class stops working rather than starting to work correctly.
    const wordBoundary = rule({
      action: 'BLOCK',
      pattern: '\\bfoo',
      patternIsRegex: true,
      publicId: 'rule-b',
    });

    const events = run([wordBoundary], ['zzzz foo', '!'], 3);

    expect(events.some((event) => event.type === 'blocked')).toBe(true);
    expect(record).toHaveBeenCalledWith({
      rule: expect.objectContaining({ publicId: 'rule-b' }),
    });
  });

  it('defaults to the window the pattern validator refuses patterns against', () => {
    const stage = createOutputStage([rule()], deps, {});
    stage.push('x'.repeat(OUTPUT_WINDOW_CHARS + 10));

    expect(stage.held).toBe(OUTPUT_WINDOW_CHARS);
  });
});

describe('wholeCodePoint', () => {
  it('pulls a boundary back off the seam of a surrogate pair', () => {
    expect(wholeCodePoint('a😀b', 2)).toBe(1);
  });

  it('leaves a boundary that falls between whole characters', () => {
    expect(wholeCodePoint('a😀b', 3)).toBe(3);
    expect(wholeCodePoint('abc', 2)).toBe(2);
  });

  it('leaves the two ends alone', () => {
    // Nothing is released at 0, and at the end the pair is whole by
    // definition — pulling back there would hold a character for no reason.
    expect(wholeCodePoint('😀', 0)).toBe(0);
    expect(wholeCodePoint('😀', 2)).toBe(2);
  });
});

describe('releaseBoundary', () => {
  const spans = (...pairs: [number, number][]) => [
    {
      rule: rule(),
      spans: pairs.map(([start, end]) => ({ start, end })),
    },
  ];

  it('is the window when nothing matches near the tail', () => {
    expect(releaseBoundary(100, spans([0, 5]), 10)).toBe(90);
  });

  it('pulls back to where a match reaching into the window begins', () => {
    expect(releaseBoundary(100, spans([85, 95]), 10)).toBe(85);
  });

  it('takes the earliest such match, not the last one seen', () => {
    expect(releaseBoundary(100, spans([95, 99], [85, 92]), 10)).toBe(85);
  });

  it('never goes negative on a buffer shorter than the window', () => {
    expect(releaseBoundary(3, [], 10)).toBe(0);
  });
});
