import { z } from 'zod';

import type { ExtractionBudget, TokenUsage } from '../extraction/budget';
import {
  describeFailure,
  describeIssues,
  type GenerateStructured,
} from '../extraction/extract-document';
import { languageName } from '../extraction/prompt';

/** One cited passage of a page, as the judge sees it. */
export type JudgedClaim = { sourceId: number; quote: string };

export type JudgedPage = {
  title: string;
  /**
   * ISO 639-3 of the page's source documents (`UserFile.language`), when
   * known. Named to the model for the explanation — see `explanationLanguage`.
   */
  language?: string | null;
  /** The page's cited passages — verbatim source text, never the model's. */
  claims: ReadonlyArray<JudgedClaim>;
};

/** Passages per side the judge is shown. A cost bound, not a quality one. */
export const MAX_CLAIMS_PER_SIDE = 60;
/** Contradictions kept per pair; more than this is a finding to read anyway. */
export const MAX_CONTRADICTIONS_PER_PAIR = 20;

/**
 * What the judge is constrained to: the shape only, for the reason
 * `extractionProviderSchema` gives (Vertex refuses a schema whose limits
 * compile to too many states). `a` and `b` are the 1-based numbers of the
 * passages in the prompt.
 */
export const contradictionProviderSchema = z.object({
  contradictions: z.array(
    z.object({ a: z.number(), b: z.number(), explanation: z.string() }),
  ),
});

export const CONTRADICTION_SYSTEM_PROMPT = `You compare two knowledge pages about the same subject, each built from a different company document. Each page is a numbered list of passages quoted verbatim from its document.

Report a contradiction only when a passage of page A and a passage of page B cannot both be true of the same thing at the same time: different numbers, amounts, deadlines or dates for the same attribute; a different person, role or team responsible for the same step; one allows what the other forbids; one says a step exists or is required and the other says it does not.

These are NOT contradictions, and must not be reported:
- one passage is more detailed than the other, or covers a case the other does not mention;
- the passages state their own different conditions or scopes (e.g. employees vs contractors, before vs after a stated date);
- the same fact in different words, units or languages ("two weeks" and "14 days");
- passages about different things that share a name;
- one passage says nothing about a requirement, deadline or detail that the other states. Silence is not disagreement.

When in doubt, do not report. An empty list is the expected answer for most pairs.

For each contradiction give the number of the passage from A, the number of the passage from B, and a one-sentence explanation naming both values, in the language the prompt names. Do not quote the passages at length.`;

export function contradictionUserPrompt(a: JudgedPage, b: JudgedPage): string {
  const list = (page: JudgedPage) =>
    page.claims
      .map((claim, i) => `${i + 1}. ${claim.quote.replace(/\s+/g, ' ').trim()}`)
      .join('\n');
  const name = languageName(explanationLanguage(a, b));
  const language = name
    ? `Write every explanation in ${name}.`
    : 'Write every explanation in the language of the passages.';
  return `${language}\n\nPage A: ${a.title}\n${list(a)}\n\nPage B: ${b.title}\n${list(b)}`;
}

/**
 * The language to explain in: page A's, when it is known, else page B's.
 *
 * Named outright because "the language of the passages" was not enough: on
 * the first measurement, 11 of 22 explanations of Polish pairs came back in
 * English — the same gap B5 found in extraction, closed the same way. A
 * reviewer reads the explanation beside the two passages, so it belongs in
 * their language; with two languages, A is the page the run wrote or the
 * older one, and either is a better answer than English by default.
 */
export function explanationLanguage(
  a: JudgedPage,
  b: JudgedPage,
): string | null {
  return a.language ?? b.language ?? null;
}

export type JudgedContradiction = {
  aSourceId: number;
  bSourceId: number;
  explanation: string;
};

export type JudgeOutcome =
  | {
      status: 'judged';
      contradictions: JudgedContradiction[];
      /** Items dropped for naming a passage that was not shown, or repeating one. */
      rejectedItems: number;
      /** Whether either side had more passages than the judge was shown. */
      truncated: boolean;
      usage: TokenUsage;
    }
  | { status: 'failed'; reason: string; usage: TokenUsage }
  | { status: 'budget_exhausted'; usage: TokenUsage };

const ATTEMPTS = 2;

/**
 * Ask the model whether two pages contradict each other, and keep only what
 * can be checked.
 *
 * The judge sees **passages, not statements**: the verbatim quotes each
 * page's sources carry, so what it compares is what the documents say rather
 * than the extraction model's rewording of it — and so a contradiction is
 * reported as two source ids, which the review queue can show side by side
 * without trusting the model's account of either.
 *
 * An answer naming a passage that was not shown is dropped, item by item;
 * a wrong shape earns one retry with the problem fed back, as extraction's
 * does. Admission to the budget is per pair.
 */
export async function judgeContradictions(input: {
  a: JudgedPage;
  b: JudgedPage;
  generate: GenerateStructured;
  budget: ExtractionBudget;
}): Promise<JudgeOutcome> {
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  if (!input.budget.admitDocument()) {
    return { status: 'budget_exhausted', usage };
  }
  const a = cap(input.a);
  const b = cap(input.b);
  const truncated =
    a.claims.length < input.a.claims.length ||
    b.claims.length < input.b.claims.length;
  if (a.claims.length === 0 || b.claims.length === 0) {
    return {
      status: 'judged',
      contradictions: [],
      rejectedItems: 0,
      truncated,
      usage,
    };
  }
  const prompt = contradictionUserPrompt(a, b);

  let problem: string | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (!input.budget.allowsCall()) {
      return { status: 'budget_exhausted', usage };
    }
    try {
      const answer = await input.generate({
        system: CONTRADICTION_SYSTEM_PROMPT,
        prompt:
          problem === null
            ? prompt
            : `${prompt}\n\nYour previous answer was rejected (${problem}). Answer again in the required shape.`,
        schema: contradictionProviderSchema,
      });
      usage.inputTokens += answer.usage.inputTokens;
      usage.outputTokens += answer.usage.outputTokens;
      input.budget.charge(answer.usage);

      const parsed = contradictionProviderSchema.safeParse(answer.object);
      if (!parsed.success) {
        problem = describeIssues(parsed.error);
        continue;
      }
      const { contradictions, rejectedItems } = resolve(
        parsed.data.contradictions,
        a,
        b,
      );
      // An answer whose every item named a passage that was not shown is
      // not "no contradiction" — it is no usable answer. Read as judged, it
      // would clear an open finding the model never actually looked at.
      if (contradictions.length === 0 && rejectedItems > 0) {
        problem = `${rejectedItems} item(s) named a passage number that was not shown`;
        continue;
      }
      return {
        status: 'judged',
        contradictions,
        rejectedItems,
        truncated,
        usage,
      };
    } catch (error) {
      problem = describeFailure(error);
    }
  }
  return { status: 'failed', reason: problem ?? 'no answer', usage };
}

function cap(page: JudgedPage): JudgedPage {
  return { ...page, claims: page.claims.slice(0, MAX_CLAIMS_PER_SIDE) };
}

function resolve(
  items: ReadonlyArray<{ a: number; b: number; explanation: string }>,
  a: JudgedPage,
  b: JudgedPage,
): { contradictions: JudgedContradiction[]; rejectedItems: number } {
  const out: JudgedContradiction[] = [];
  const seen = new Set<string>();
  let rejectedItems = 0;
  for (const item of items) {
    const left = a.claims[item.a - 1];
    const right = b.claims[item.b - 1];
    const explanation = item.explanation.trim().slice(0, 400);
    const key = `${item.a}:${item.b}`;
    if (
      !Number.isInteger(item.a) ||
      !Number.isInteger(item.b) ||
      !left ||
      !right ||
      explanation.length === 0 ||
      seen.has(key)
    ) {
      rejectedItems += 1;
      continue;
    }
    seen.add(key);
    out.push({
      aSourceId: left.sourceId,
      bSourceId: right.sourceId,
      explanation,
    });
  }
  rejectedItems += Math.max(0, out.length - MAX_CONTRADICTIONS_PER_PAIR);
  return {
    contradictions: out.slice(0, MAX_CONTRADICTIONS_PER_PAIR),
    rejectedItems,
  };
}
