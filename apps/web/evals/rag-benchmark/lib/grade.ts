import type { Question } from './types';

/**
 * Grading has two independent gates, and a case passes only if both do.
 *
 * The deterministic gate is a substring check over the invented figures. It is
 * the one that actually proves retrieval: every number in this corpus exists
 * nowhere outside it, so "87" in the answer cannot have come from pre-training.
 *
 * The rubric gate is an LLM judge, for the part a substring cannot see — did
 * the answer *refuse* rather than invent, did it correct the false premise,
 * did it compare the two deadlines instead of reciting one. A judge alone
 * would be too soft (it rewards a confident wrong number); substrings alone
 * would be too blunt (an answer containing "87" while denying it is true).
 */

/**
 * Collapse the ways the same figure is written before comparing.
 *
 * Documents and answers disagree about spacing inside numbers — "4 180 000",
 * "4<NBSP>180<NBSP>000", "4180000" are one figure — and about the decimal
 * separator ("249,50" vs "249.50"). Comparing raw text turns that into a
 * failure that says nothing about retrieval.
 */
export function normalizeForMatch(text: string): string {
  return (
    text
      .normalize('NFC')
      .toLowerCase()
      // Every flavour of space, including NBSP and the narrow NBSP that
      // Polish typography puts inside thousands groups (U+00A0, U+202F, U+2009).
      .replace(/[\s   ]+/g, ' ')
      .trim()
  );
}

/**
 * A second reading of the same text with intra-number spacing removed and the
 * decimal comma folded to a dot, so "4 180 000" and "4180000" compare equal.
 * Applied to both sides, never in place of the plain reading — dropping the
 * space unconditionally would also merge two unrelated adjacent numbers.
 */
export function normalizeNumbers(text: string): string {
  return normalizeForMatch(text)
    .replace(/(?<=\d) (?=\d)/g, '')
    .replace(/(?<=\d),(?=\d)/g, '.');
}

/**
 * A third reading with *every* separator between digits removed.
 *
 * The two readings above still disagree about a comma: Polish writes
 * "249,50" as a decimal and English writes "2,740,000" as thousands, and no
 * rule distinguishes them from the character alone. A benchmark whose corpus
 * is deliberately bilingual runs into this on the first multi-hop question —
 * the answer said "EUR 2,740,000", the expectation said "2 740 000", and the
 * case failed while the judge confirmed the figure was right.
 *
 * Reducing both sides to their digits settles it without a guess. It is the
 * loosest reading, which is why it is a fallback rather than the only one, and
 * why `expectNone` benefits from it too: a distractor written in the other
 * locale's notation should still trip the gate.
 */
export function normalizeDigits(text: string): string {
  return normalizeForMatch(text).replace(/(?<=\d)[ ,.](?=\d)/g, '');
}

/** Does `needle` occur in `haystack` under any of the three readings? */
export function containsExpectation(haystack: string, needle: string): boolean {
  return (
    normalizeForMatch(haystack).includes(normalizeForMatch(needle)) ||
    normalizeNumbers(haystack).includes(normalizeNumbers(needle)) ||
    normalizeDigits(haystack).includes(normalizeDigits(needle))
  );
}

export interface AssertionOutcome {
  passed: boolean;
  failures: string[];
}

export function runAssertions(
  question: Question,
  answer: string,
): AssertionOutcome {
  const failures: string[] = [];

  for (const needle of question.expectAll ?? []) {
    if (!containsExpectation(answer, needle)) {
      failures.push(`missing: "${needle}"`);
    }
  }

  if (question.expectAny?.length) {
    const hit = question.expectAny.some((n) => containsExpectation(answer, n));
    if (!hit) {
      failures.push(`none of: ${question.expectAny.join(' | ')}`);
    }
  }

  // The distractor gate. Every `expectNone` entry is a real figure from a
  // *different* document in the same collection, so a hit here is the exact
  // failure the corpus was built to catch: the right shape of answer drawn
  // from the wrong document.
  for (const needle of question.expectNone ?? []) {
    if (containsExpectation(answer, needle)) {
      failures.push(`must not contain: "${needle}"`);
    }
  }

  return { passed: failures.length === 0, failures };
}

export interface JudgeVerdict {
  pass: boolean;
  reason: string;
  /**
   * Set when the judge answered but the verdict could not be read. A verdict
   * with this field is *ungraded*, not failed — see `parseJudgeVerdict`.
   */
  error?: string;
}

/**
 * Ask the judge model whether the answer satisfies the rubric.
 *
 * Routed through the LiteLLM proxy like everything else, so the benchmark
 * needs no provider key of its own.
 */
export async function judge(
  rubric: string,
  question: string,
  answer: string,
  opts: { baseUrl: string; apiKey?: string; model: string },
): Promise<JudgeVerdict> {
  const body = {
    model: opts.model,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'You grade answers against a rubric. Reply with JSON only: {"pass": boolean, "reason": string}. ' +
          'The reason must be one short sentence. Grade strictly: if the rubric is only partly satisfied, that is a fail. ' +
          'Judge the answer against the rubric alone — do not reward or punish it for the language it is written in unless the rubric says so.',
      },
      {
        role: 'user',
        content: `RUBRIC:\n${rubric}\n\nQUESTION:\n${question}\n\nANSWER:\n${answer}`,
      },
    ],
  };

  const res = await fetch(`${opts.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    // As in arms.ts: an un-timed-out fetch turns a stalled socket into a hung
    // run instead of a retry.
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`Judge call failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? '';
  return parseJudgeVerdict(raw);
}

/**
 * Models wrap JSON in prose or a fenced block often enough that a bare
 * `JSON.parse` fails on answers that are otherwise fine. A parse failure is
 * not thrown — one unreadable verdict should cost one case, not the whole run
 * — but it is not a failed rubric either.
 *
 * The difference matters for what the report means. A failed rubric says the
 * pipeline answered badly; an unreadable verdict says the *instrument* did not
 * report, which is a fact about the judge model. Folding the second into the
 * first makes a judge having a bad day look like a quality regression. So a
 * parse failure carries `error`, and every tally treats such a case as
 * ungraded: excluded from the denominator rather than counted as a loss.
 */
export function parseJudgeVerdict(raw: string): JudgeVerdict {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      pass: false,
      reason: `judge returned no JSON: ${raw.slice(0, 120)}`,
      error: 'judge returned no JSON',
    };
  }
  try {
    const parsed = JSON.parse(match[0]) as { pass?: unknown; reason?: unknown };
    // A verdict whose `pass` is absent or not a boolean is as unreadable as
    // one that would not parse: `pass !== true` would silently score it a
    // fail, which is the conflation this function exists to avoid.
    if (typeof parsed.pass !== 'boolean') {
      return {
        pass: false,
        reason: `judge verdict has no boolean "pass": ${match[0].slice(0, 120)}`,
        error: 'judge verdict has no boolean "pass"',
      };
    }
    return {
      pass: parsed.pass,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    };
  } catch {
    return {
      pass: false,
      reason: `judge returned unparseable JSON: ${match[0].slice(0, 120)}`,
      error: 'judge returned unparseable JSON',
    };
  }
}
