import type { MemoryPlan } from '../activities/memory/extraction-plan.js';
import type {
  MemoryCase,
  MemoryCaseKind,
} from './fixtures/memory-extraction-cases.js';

/**
 * Scoring for the memory-extraction eval (spec
 * 2026-09-27-personal-memory-across-threads, C2), kept apart from the model
 * call so it is tested without one.
 */

export interface MemoryCaseResult {
  id: string;
  kind: MemoryCaseKind;
  expect: 'keep' | 'drop';
  /** The plan writes anything: an add, an update or a delete. */
  wrote: boolean;
  /** For a keep case, every `mentions` term appears in what was written. */
  mentionsOk: boolean;
  /** For a case with `supersedes`, the plan applies that operation to m1. */
  supersedesOk: boolean;
  correct: boolean;
}

export function scoreCase(c: MemoryCase, plan: MemoryPlan): MemoryCaseResult {
  const written = [
    ...plan.adds.map((a) => a.content),
    ...plan.updates.map((u) => u.content),
  ]
    .join('\n')
    .toLowerCase();
  const wrote =
    plan.adds.length + plan.updates.length + plan.deletes.length > 0;
  const mentionsOk = (c.mentions ?? []).every((term) =>
    written.includes(term.toLowerCase()),
  );
  const first = c.current?.[0];
  const supersedesOk =
    c.supersedes === undefined ||
    (c.supersedes === 'update'
      ? plan.updates.some((u) => u.memory.content === first)
      : plan.deletes.some((d) => d.content === first));
  const correct =
    c.expect === 'keep' ? wrote && mentionsOk && supersedesOk : !wrote;
  return {
    id: c.id,
    kind: c.kind,
    expect: c.expect,
    wrote,
    mentionsOk,
    supersedesOk,
    correct,
  };
}

/** `--repeats`: a positive whole number, or a usage error before any model call is paid for. */
export function parseRepeats(raw: string | undefined): number {
  const value = raw ?? '3';
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(
      `--repeats must be a positive whole number, got "${value}"`,
    );
  }
  return Number(value);
}

const rate = (hits: number, total: number): number | null =>
  total === 0 ? null : hits / total;

export interface MemoryEvalSummary {
  /** Of the cases where something was written, the share that should have been. */
  keepPrecision: number | null;
  /** Of the keep cases (not "yes, like that"), the share kept correctly. */
  keepRecall: number | null;
  /** Of the drop cases, the share that wrote nothing. */
  dropRecall: number | null;
  /** The rollout gate (E2): organizational facts left unwritten, ≥ 95%. */
  orgFactDropRate: number | null;
  /** What excluding the answer costs: "yes, like that" cases kept. */
  yesLikeThatKept: number | null;
  byKind: Record<string, { correct: number; total: number }>;
}

export function summarizeCases(
  results: readonly MemoryCaseResult[],
): MemoryEvalSummary {
  const keep = results.filter(
    (r) => r.expect === 'keep' && r.kind !== 'yes-like-that',
  );
  const drop = results.filter((r) => r.expect === 'drop');
  const wrote = results.filter((r) => r.wrote);
  const orgFacts = results.filter((r) => r.kind === 'org-fact');
  const yes = results.filter((r) => r.kind === 'yes-like-that');

  const byKind: MemoryEvalSummary['byKind'] = {};
  for (const r of results) {
    const entry = (byKind[r.kind] ??= { correct: 0, total: 0 });
    entry.total += 1;
    entry.correct += r.correct ? 1 : 0;
  }

  return {
    keepPrecision: rate(
      wrote.filter((r) => r.expect === 'keep').length,
      wrote.length,
    ),
    keepRecall: rate(keep.filter((r) => r.correct).length, keep.length),
    dropRecall: rate(drop.filter((r) => r.correct).length, drop.length),
    orgFactDropRate: rate(
      orgFacts.filter((r) => r.correct).length,
      orgFacts.length,
    ),
    yesLikeThatKept: rate(yes.filter((r) => r.correct).length, yes.length),
    byKind,
  };
}
