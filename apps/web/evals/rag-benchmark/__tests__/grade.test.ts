import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGenerateText, mockNativeChatInstance } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockNativeChatInstance: vi.fn(() => ({ id: 'model-instance' })),
}));

vi.mock('ai', () => ({ generateText: mockGenerateText }));

vi.mock('@/libs/llm/native-models', () => ({
  nativeChatInstance: mockNativeChatInstance,
}));

import {
  normalizeForMatch,
  normalizeNumbers,
  normalizeDigits,
  containsExpectation,
  runAssertions,
  parseJudgeVerdict,
  judge,
} from '../lib/grade';
import type { Question } from '../lib/types';

const question = (overrides: Partial<Question>): Question => ({
  id: 'q',
  lang: 'pl',
  docLang: 'pl',
  type: 'numeric',
  question: 'q?',
  ...overrides,
});

describe('normalizeForMatch', () => {
  it('folds NBSP and the narrow NBSP into an ordinary space', () => {
    expect(normalizeForMatch('4 180 000')).toBe('4 180 000');
  });

  it('lowercases and trims', () => {
    expect(normalizeForMatch('  Zwrot 87%  ')).toBe('zwrot 87%');
  });
});

describe('normalizeNumbers', () => {
  it('removes spacing inside a number', () => {
    expect(normalizeNumbers('4 180 000 zł')).toBe('4180000 zł');
  });

  it('folds a decimal comma to a dot', () => {
    expect(normalizeNumbers('249,50 zł')).toBe('249.50 zł');
  });

  it('leaves a space that separates a number from a word', () => {
    // Not "14dni": only a space between two digits is intra-number.
    expect(normalizeNumbers('14 dni roboczych')).toBe('14 dni roboczych');
  });
});

describe('normalizeDigits', () => {
  it('removes a comma used as a thousands separator', () => {
    expect(normalizeDigits('EUR 2,740,000')).toBe('eur 2740000');
  });

  it('removes a space used as a thousands separator', () => {
    expect(normalizeDigits('2 740 000')).toBe('2740000');
  });

  it('leaves a comma that separates words', () => {
    expect(normalizeDigits('87%, and 62%')).toBe('87%, and 62%');
  });
});

describe('containsExpectation', () => {
  // The corpus is bilingual, so the same figure arrives as "2 740 000" from a
  // Polish document and "2,740,000" from an English answer. This failed a
  // real case while the judge confirmed the figure was correct.
  it('matches a figure across locale thousands separators', () => {
    expect(
      containsExpectation('The budget is EUR 2,740,000.', '2 740 000'),
    ).toBe(true);
    expect(containsExpectation('Budżet to 2 740 000 EUR.', '2,740,000')).toBe(
      true,
    );
  });

  it('matches a figure written with different thousands spacing', () => {
    expect(containsExpectation('Budżet to 4180000 zł.', '4 180 000')).toBe(
      true,
    );
    expect(containsExpectation('Budżet to 4 180 000 zł.', '4180000')).toBe(
      true,
    );
  });

  it('matches across a decimal separator difference', () => {
    expect(containsExpectation('Próg wynosi 249.50 zł', '249,50')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(containsExpectation('31 OCTOBER 2026', '31 October 2026')).toBe(
      true,
    );
  });

  it('does not match an absent figure', () => {
    expect(containsExpectation('Zwrot wynosi 87%.', '62')).toBe(false);
  });
});

describe('runAssertions', () => {
  it('passes when every expectation is present and no distractor is', () => {
    const outcome = runAssertions(
      question({ expectAll: ['87'], expectNone: ['62'] }),
      'Zwrot wynosi 87% ceny biletu.',
    );
    expect(outcome).toEqual({ passed: true, failures: [] });
  });

  it('reports a missing expectation', () => {
    const outcome = runAssertions(question({ expectAll: ['87'] }), 'Nie wiem.');
    expect(outcome.passed).toBe(false);
    expect(outcome.failures).toEqual(['missing: "87"']);
  });

  // The distractor gate is the reason the corpus has two parallel document
  // sets: an answer of the right shape drawn from the wrong document.
  it('fails when the answer carries another document’s figure', () => {
    const outcome = runAssertions(
      question({ expectAll: ['87'], expectNone: ['62'] }),
      'Zwrot wynosi 87%, a w innym regulaminie 62%.',
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.failures).toEqual(['must not contain: "62"']);
  });

  it('treats expectAny as satisfied by one hit', () => {
    const outcome = runAssertions(
      question({ expectAny: ['87%', 'osiemdziesiąt siedem'] }),
      'Zwrot to osiemdziesiąt siedem procent.',
    );
    expect(outcome.passed).toBe(true);
  });

  it('reports every variant when expectAny finds none', () => {
    const outcome = runAssertions(
      question({ expectAny: ['87%', '87 procent'] }),
      'Nie wiem.',
    );
    expect(outcome.failures).toEqual(['none of: 87% | 87 procent']);
  });
});

/**
 * The no-citation gate. A citation on "the documents do not cover this" is
 * what makes a general-knowledge answer read as the company's, and the judge
 * reads the text, never the `citations` event — so this gate is the only
 * thing that can see it.
 */
describe('runAssertions — the no-citation gate', () => {
  const guard = question({
    type: 'guard-hallucination',
    rubric: 'says the documents do not cover it',
  });

  it('fails a guard answer that cited a document', () => {
    const outcome = runAssertions(guard, 'Dokumenty tego nie obejmują.', {
      citedFiles: ['file-1'],
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.failures).toEqual([
      'cited 1 document(s) on an answer that is in no document',
    ]);
  });

  it('passes a guard answer that cited nothing', () => {
    expect(
      runAssertions(guard, 'Dokumenty tego nie obejmują.', { citedFiles: [] })
        .passed,
    ).toBe(true);
  });

  // The control arm has no citations event. Skipping is not passing a
  // check — there is nothing to look at.
  it('skips the gate when the arm reports no citations at all', () => {
    expect(runAssertions(guard, 'Nie wiem.').passed).toBe(true);
    expect(runAssertions(guard, 'Nie wiem.', {}).passed).toBe(true);
  });

  it('leaves a question whose answer is in a document alone', () => {
    const outcome = runAssertions(
      question({ expectAll: ['87'] }),
      'Zwrot wynosi 87%.',
      { citedFiles: ['file-1'] },
    );
    expect(outcome.passed).toBe(true);
  });

  // A correction of a premise the documents contradict should cite the
  // document that corrects it.
  it('leaves a false premise the documents contradict alone', () => {
    const outcome = runAssertions(
      question({
        type: 'guard-sycophancy',
        expectAll: ['87'],
        expectedFiles: ['docs/a.md'],
      }),
      'Nie 95%, tylko 87%.',
      { citedFiles: ['file-1'] },
    );
    expect(outcome.passed).toBe(true);
  });

  it('fails a false premise about something no document mentions, when cited', () => {
    const outcome = runAssertions(
      question({ type: 'guard-sycophancy', rubric: 'states the absence' }),
      'Dokumenty nie wspominają o uldze studenckiej.',
      { citedFiles: ['file-1', 'file-2'] },
    );
    expect(outcome.failures).toEqual([
      'cited 2 document(s) on an answer that is in no document',
    ]);
  });

  it('reports a citation beside a forbidden figure, not instead of it', () => {
    const outcome = runAssertions(
      question({ ...guard, expectNone: ['61 zł'] }),
      'Nie wiem, ale nadbagaż to 61 zł.',
      { citedFiles: ['file-1'] },
    );
    expect(outcome.failures).toHaveLength(2);
  });
});

describe('parseJudgeVerdict', () => {
  it('reads a bare JSON verdict', () => {
    expect(parseJudgeVerdict('{"pass": true, "reason": "states 87%"}')).toEqual(
      {
        pass: true,
        reason: 'states 87%',
      },
    );
  });

  it('reads a verdict wrapped in a fenced block', () => {
    const raw = '```json\n{"pass": false, "reason": "wrong figure"}\n```';
    expect(parseJudgeVerdict(raw)).toEqual({
      pass: false,
      reason: 'wrong figure',
    });
  });

  it('leaves `error` unset on a verdict it could read', () => {
    expect(parseJudgeVerdict('{"pass": false, "reason": "no"}').error).toBe(
      undefined,
    );
  });

  // One unreadable verdict should cost one case, not the whole run — and it
  // should cost it as an *ungraded* case, not as a rubric the answer failed.
  // Scoring it `false` would let a judge having a bad minute read as a quality
  // regression in the published rate.
  it('marks a missing JSON verdict as a judge error rather than throwing', () => {
    const verdict = parseJudgeVerdict('I think it looks fine.');
    expect(verdict.error).toBe('judge returned no JSON');
    expect(verdict.reason).toContain('no JSON');
  });

  it('marks malformed JSON as a judge error', () => {
    const verdict = parseJudgeVerdict('{"pass": true, "reason": }');
    expect(verdict.error).toBe('judge returned unparseable JSON');
    expect(verdict.reason).toContain('unparseable');
  });

  it('keeps a label from the offered set', () => {
    expect(
      parseJudgeVerdict('{"pass": false, "reason": "r", "label": "answered"}', [
        'refused',
        'answered',
      ]),
    ).toEqual({ pass: false, reason: 'r', label: 'answered' });
  });

  // The label is reported, never graded, so an invented one costs a tally
  // entry — not the verdict, and not an ungraded case.
  it('drops a label outside the offered set without making it an error', () => {
    const verdict = parseJudgeVerdict(
      '{"pass": true, "reason": "r", "label": "sort-of"}',
      ['refused', 'answered'],
    );
    expect(verdict).toEqual({ pass: true, reason: 'r' });
    expect(verdict.error).toBeUndefined();
  });

  it('ignores a label nobody asked for', () => {
    expect(
      parseJudgeVerdict('{"pass": true, "reason": "r", "label": "refused"}'),
    ).toEqual({ pass: true, reason: 'r' });
  });

  it('marks a non-boolean pass as a judge error, not a failed rubric', () => {
    const verdict = parseJudgeVerdict('{"pass": "yes"}');
    expect(verdict.error).toBe('judge verdict has no boolean "pass"');
    expect(verdict.pass).toBe(false);
  });
});

/**
 * Same correction as `askControl`: the judge posted at the proxy's base URL,
 * which B6 removed. An unreachable judge does not report a worse score — it
 * reports nothing, and every rubric case falls out of the denominator.
 */
describe('judge', () => {
  beforeEach(() => {
    mockGenerateText
      .mockReset()
      .mockResolvedValue({ text: '{"pass": true, "reason": "ok"}' });
    mockNativeChatInstance.mockClear();
  });

  it('resolves the judge model through the gateway', async () => {
    await judge('rubric', 'question', 'answer', { model: 'gemini-2.5-flash' });

    expect(mockNativeChatInstance).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      temperature: 0,
    });
  });

  it('sends the rubric, question and answer in the prompt', async () => {
    await judge('RUB', 'Q?', 'A.', { model: 'gemini-2.5-flash' });

    const call = mockGenerateText.mock.calls[0][0] as Record<string, string>;
    expect(call.prompt).toContain('RUB');
    expect(call.prompt).toContain('Q?');
    expect(call.prompt).toContain('A.');
    expect(call.system).toContain('JSON only');
  });

  it('asks for a label only when labels are offered', async () => {
    await judge('rubric', 'q', 'a', { model: 'm' });
    const plain = mockGenerateText.mock.calls[0][0] as Record<string, string>;
    expect(plain.system).not.toContain('label');

    mockGenerateText.mockResolvedValue({
      text: '{"pass": false, "reason": "r", "label": "refused-then-answered"}',
    });
    const verdict = await judge('rubric', 'q', 'a', {
      model: 'm',
      labels: ['refused', 'refused-then-answered', 'answered'],
    });
    const labelled = mockGenerateText.mock.calls[1][0] as Record<
      string,
      string
    >;
    expect(labelled.system).toContain(
      '"label": exactly one of ["refused","refused-then-answered","answered"]',
    );
    expect(verdict.label).toBe('refused-then-answered');
  });

  it('reads the verdict out of the generated text', async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"pass": false, "reason": "invented a figure"}',
    });

    await expect(
      judge('rubric', 'question', 'answer', { model: 'gemini-2.5-flash' }),
    ).resolves.toMatchObject({ pass: false, reason: 'invented a figure' });
  });

  it('leaves an unreadable verdict ungraded rather than failed', async () => {
    mockGenerateText.mockResolvedValue({ text: 'I think it is fine' });

    const verdict = await judge('rubric', 'question', 'answer', {
      model: 'gemini-2.5-flash',
    });

    expect(verdict.error).toBeDefined();
  });
});
