import { z } from 'zod';

import type {
  FindingSummary,
  KnowledgeFindingType,
} from '../contracts/brain.types';

/**
 * The `detail` shapes the worker writes, per finding type (spec C1–C3). Read
 * tolerantly — each field optional where the worker could have omitted it —
 * because a finding written by an older worker, or a type this panel does
 * not know yet, must render as "no detail", not take the page down.
 */
const contradictionDetail = z.object({
  pairs: z.array(
    z.object({
      aSourceId: z.number(),
      bSourceId: z.number(),
      explanation: z.string(),
    }),
  ),
});
const staleDetail = z.object({
  reasons: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('source_deleted'), fileId: z.string() }),
      z.object({ kind: z.literal('quote_gone'), fileId: z.string() }),
      z.object({ kind: z.literal('verification_due'), dueAt: z.string() }),
    ]),
  ),
});
const unownedDetail = z.object({ rule: z.enum(['no_owner', 'owner_left']) });
const failedDetail = z.object({ reason: z.string().optional() });

/** What a summary needs looked up beyond the finding row itself. */
export type SummaryLookups = {
  /** `KnowledgePageSource.id` → its quote, for contradictions. */
  quotes: ReadonlyMap<number, string>;
  /** File id → its name, for stale sources. */
  fileNames: ReadonlyMap<string, string>;
};

/** The source ids a contradiction's detail names, to look their quotes up. */
export function contradictionSourceIds(detail: unknown): number[] {
  const parsed = contradictionDetail.safeParse(detail);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.pairs.flatMap((p) => [p.aSourceId, p.bSourceId]);
}

/** The file ids a stale finding's detail names, to look their names up. */
export function staleFileIds(detail: unknown): string[] {
  const parsed = staleDetail.safeParse(detail);
  if (!parsed.success) {
    return [];
  }
  return parsed.data.reasons.flatMap((r) => ('fileId' in r ? [r.fileId] : []));
}

export function summarizeFinding(
  type: KnowledgeFindingType,
  detail: unknown,
  lookups: SummaryLookups,
): FindingSummary {
  switch (type) {
    case 'CONTRADICTION': {
      const parsed = contradictionDetail.safeParse(detail);
      if (!parsed.success) {
        return { kind: 'unknown' };
      }
      return {
        kind: 'contradiction',
        pairs: parsed.data.pairs.map((p) => ({
          a: lookups.quotes.get(p.aSourceId) ?? null,
          b: lookups.quotes.get(p.bSourceId) ?? null,
          explanation: p.explanation,
        })),
      };
    }
    case 'STALE': {
      const parsed = staleDetail.safeParse(detail);
      if (!parsed.success) {
        return { kind: 'unknown' };
      }
      return {
        kind: 'stale',
        reasons: parsed.data.reasons.map((r) =>
          r.kind === 'verification_due'
            ? r
            : {
                kind: r.kind,
                fileName: lookups.fileNames.get(r.fileId) ?? null,
              },
        ),
      };
    }
    case 'UNOWNED': {
      const parsed = unownedDetail.safeParse(detail);
      return {
        kind: 'unowned',
        ownerLeft: parsed.success && parsed.data.rule === 'owner_left',
      };
    }
    case 'ORPHAN':
      return { kind: 'orphan' };
    case 'GAP':
      return { kind: 'gap' };
    case 'EXTRACTION_FAILED': {
      const parsed = failedDetail.safeParse(detail);
      return {
        kind: 'extraction_failed',
        reason: parsed.success ? (parsed.data.reason ?? null) : null,
      };
    }
    default:
      return { kind: 'unknown' };
  }
}
