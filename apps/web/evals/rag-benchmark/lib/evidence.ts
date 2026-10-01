import { containsExpectation } from './grade';
import type { CaseResult, Question } from './types';

/**
 * Evidence recall: of the figures a question's assertions look for, how many
 * were in the context the answer model was given (spec
 * 2026-09-29-llm-document-selection, Phase A2).
 *
 * The pass rate cannot tell "retrieval missed it" from "the model had it and
 * ignored it" — both fail the same assertion. The server's `retrieval` event
 * names the chunks it rendered (`trace.chunks`); the harness reads their text
 * back and asks the same substring question of it that `runAssertions` asks
 * of the answer. `expectAll` counts each needle; `expectAny` counts as one,
 * found if any of its alternatives is. `expectNone` is not evidence and is
 * left out. A question with neither (a guard question) has no evidence to
 * find, and is `null` rather than a perfect score.
 */
export interface Evidence {
  needles: number;
  found: number;
}

export function evidenceFor(
  question: Pick<Question, 'expectAll' | 'expectAny'>,
  retrievedTexts: readonly string[],
): Evidence | null {
  const context = retrievedTexts.join('\n\n');
  const all = question.expectAll ?? [];
  const any = question.expectAny ?? [];
  const needles = all.length + (any.length > 0 ? 1 : 0);
  if (needles === 0) {
    return null;
  }
  const found =
    all.filter((n) => containsExpectation(context, n)).length +
    (any.some((n) => containsExpectation(context, n)) ? 1 : 0);
  return { needles, found };
}

export interface ChunkPosition {
  fileId: string;
  chunkIndex: number;
}

/** One scroll call's worth of points, as the Qdrant client returns them. */
export type ScrollChunks = (
  fileId: string,
  chunkIndexes: number[],
) => Promise<{ chunkIndex: number; text: string }[]>;

/**
 * The text of each position, in the order given. A position the store no
 * longer holds (a re-index raced the run) is skipped: it cannot be evidence,
 * and pretending otherwise would credit retrieval with text the model never
 * saw.
 */
export async function chunkTextsFor(
  positions: readonly ChunkPosition[],
  scroll: ScrollChunks,
): Promise<string[]> {
  const byFile = new Map<string, number[]>();
  for (const { fileId, chunkIndex } of positions) {
    byFile.set(fileId, [...(byFile.get(fileId) ?? []), chunkIndex]);
  }
  const texts = new Map<string, string>();
  for (const [fileId, indexes] of byFile) {
    for (const point of await scroll(fileId, [...new Set(indexes)])) {
      texts.set(`${fileId}#${point.chunkIndex}`, point.text);
    }
  }
  return positions
    .map((p) => texts.get(`${p.fileId}#${p.chunkIndex}`))
    .filter((text): text is string => text !== undefined);
}

export interface EvidenceTally {
  /** RAG cases that had evidence to find and a trace to look in. */
  cases: number;
  /** Of those, cases where every needle was in the context. */
  complete: number;
  needles: number;
  found: number;
}

export function tallyEvidence(results: readonly CaseResult[]): EvidenceTally {
  const withEvidence = results.filter(
    (r) => r.arm === 'rag' && r.evidence !== undefined,
  );
  return {
    cases: withEvidence.length,
    complete: withEvidence.filter(
      (r) => r.evidence!.found === r.evidence!.needles,
    ).length,
    needles: withEvidence.reduce((sum, r) => sum + r.evidence!.needles, 0),
    found: withEvidence.reduce((sum, r) => sum + r.evidence!.found, 0),
  };
}

function pct(part: number, whole: number): string {
  return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;
}

export function formatEvidence(tally: EvidenceTally): string {
  if (tally.cases === 0) {
    return '—';
  }
  return `${tally.found}/${tally.needles} (${pct(tally.found, tally.needles)}); all evidence in context ${tally.complete}/${tally.cases}`;
}

/**
 * The report section. Rows by the same slices as the pass rate, so the two
 * can be read side by side: a slice whose pass rate is low while its evidence
 * recall is high failed in the answer, not in retrieval.
 */
export function evidenceSection(results: readonly CaseResult[]): string {
  const rows: [string, (r: CaseResult) => boolean][] = [
    ['all questions', () => true],
    ['same language', (r) => r.lang === r.docLang],
    ['cross-lingual', (r) => r.lang !== r.docLang],
    ...[...new Set(results.map((r) => r.type))].map(
      (type) =>
        [`type: ${type}`, (r: CaseResult) => r.type === type] as [
          string,
          (r: CaseResult) => boolean,
        ],
    ),
  ];
  const lines = [
    '## Evidence recall (RAG arm)',
    '',
    "Of the figures each question's assertions look for, how many were in the",
    'chunks the server says it gave the answer model — read back from the',
    "`retrieval` event's trace. Low evidence with a low pass rate is a",
    'retrieval miss; high evidence with a low pass rate is the answer.',
    '',
    '| | evidence found |',
    '|---|---|',
  ];
  for (const [label, keep] of rows) {
    lines.push(
      `| ${label} | ${formatEvidence(tallyEvidence(results.filter(keep)))} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
