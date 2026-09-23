import type { ExtractFileResult } from '../activities/brain/extract-document-candidates.js';

/**
 * The pure half of `brain-extract-preview.ts`: turning extraction results
 * into what a person reads. Separate so it is tested without a model or a
 * database, and so the script itself stays a thin loop.
 */

export type PreviewOptions = {
  orgId: string;
  projectId: string | undefined;
  fileIds: string[];
  limit: number;
  maxTokens: number;
  json: string | undefined;
  write: boolean;
  /** How many dropped claims to print per document. */
  showDropped: number;
};

export const PREVIEW_USAGE = `Usage:
  npx tsx --env-file=.env.local apps/worker/src/scripts/brain-extract-preview.ts \
    --org <id> [options]

Runs Ragen Brain extraction over documents and prints what it produced.
Dry run by default: nothing is written except the AI-usage rows the model
calls cost.

  --org <id>          organization (or BRAIN_PREVIEW_ORG_ID)
  --project <id>      only this project's documents
  --file <id>         only this file; repeatable, overrides --project
  --limit <n>         at most n documents, newest first (default 10)
  --max-tokens <n>    run budget (default BRAIN_EXTRACT_MAX_TOKENS)
  --show-dropped <n>  dropped claims printed per document (default 3)
  --json <path>       also write every candidate and dropped claim here
  --write             persist candidates as the job does — needs the
                      organization's \`brain\` flag on`;

export class PreviewUsageError extends Error {
  override name = 'PreviewUsageError';
}

export function parsePreviewOptions(
  argv: string[],
  env: Record<string, string | undefined>,
  defaultMaxTokens: number,
): PreviewOptions {
  const values = (flag: string): string[] => {
    const out: string[] = [];
    argv.forEach((arg, i) => {
      if (arg === flag) {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          throw new PreviewUsageError(`${flag} needs a value`);
        }
        out.push(next);
      }
    });
    return out;
  };
  const one = (flag: string) => values(flag).at(-1);
  const positive = (flag: string, fallback: number) => {
    const raw = one(flag);
    if (raw === undefined) {
      return fallback;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      throw new PreviewUsageError(`${flag} must be a non-negative integer`);
    }
    return n;
  };

  const known = new Set([
    '--org',
    '--project',
    '--file',
    '--limit',
    '--max-tokens',
    '--show-dropped',
    '--json',
    '--write',
  ]);
  for (const arg of argv) {
    if (arg.startsWith('--') && !known.has(arg)) {
      throw new PreviewUsageError(`unknown option ${arg}`);
    }
  }

  const orgId = one('--org') ?? env.BRAIN_PREVIEW_ORG_ID;
  if (!orgId) {
    throw new PreviewUsageError('--org is required');
  }
  const limit = positive('--limit', 10);
  if (limit === 0) {
    throw new PreviewUsageError('--limit must be at least 1');
  }

  return {
    orgId,
    projectId: one('--project'),
    fileIds: values('--file'),
    limit,
    maxTokens: positive('--max-tokens', defaultMaxTokens),
    json: one('--json'),
    write: argv.includes('--write'),
    showDropped: positive('--show-dropped', 3),
  };
}

export type PreviewRow = {
  fileId: string;
  fileName: string;
  result: ExtractFileResult;
};

export type PreviewTotals = {
  documents: number;
  extracted: number;
  failed: number;
  notAttempted: number;
  pages: number;
  keptClaims: number;
  droppedClaims: number;
  /** Items that failed their limits before the quote check saw them. */
  rejectedItems: number;
  edges: { EXTRACTED: number; INFERRED: number; AMBIGUOUS: number };
  tokens: number;
};

export function totalsOf(rows: PreviewRow[], skipped: number): PreviewTotals {
  const totals: PreviewTotals = {
    documents: rows.length + skipped,
    extracted: 0,
    failed: 0,
    notAttempted: skipped,
    pages: 0,
    keptClaims: 0,
    droppedClaims: 0,
    rejectedItems: 0,
    edges: { EXTRACTED: 0, INFERRED: 0, AMBIGUOUS: 0 },
    tokens: 0,
  };
  for (const { result } of rows) {
    totals.tokens += result.tokens;
    if (result.status === 'extracted') {
      totals.extracted += 1;
      totals.pages += result.assembled.pages.length;
      totals.keptClaims += result.assembled.pages.reduce(
        (n, page) => n + page.sources.length,
        0,
      );
      totals.droppedClaims += result.assembled.unverifiedClaims;
      totals.rejectedItems += result.rejectedItems;
      for (const edge of result.assembled.edges) {
        totals.edges[edge.origin] += 1;
      }
    } else if (result.status === 'failed') {
      totals.failed += 1;
    } else {
      totals.notAttempted += 1;
    }
  }
  return totals;
}

/**
 * The share of claims the model offered that failed the quote check. The one
 * number B5 exists to produce: high means the model paraphrases instead of
 * quoting, and every dropped claim is knowledge a curator never sees.
 */
export function dropRate(totals: PreviewTotals): number | null {
  const offered = totals.keptClaims + totals.droppedClaims;
  return offered === 0 ? null : totals.droppedClaims / offered;
}

function percent(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export function renderRow(row: PreviewRow, showDropped: number): string {
  const { result } = row;
  const head = `## ${row.fileName}  (${row.fileId})`;
  if (result.status === 'budget_exhausted') {
    return `${head}\n   not attempted — the run budget ran out (${result.tokens} tokens)`;
  }
  if (result.status === 'failed') {
    const where =
      result.windowIndex === null ? '' : ` at window ${result.windowIndex}`;
    return `${head}\n   FAILED${where}: ${result.reason} (${result.tokens} tokens)`;
  }

  const { pages, edges, unverified } = result.assembled;
  const kept = pages.reduce((n, page) => n + page.sources.length, 0);
  const lines = [
    head,
    `   ${pages.length} pages · ${kept} claims kept · ${unverified.length} dropped · ` +
      `${result.rejectedItems} malformed · ${edges.length} edges · ${result.tokens} tokens`,
  ];
  for (const page of pages) {
    lines.push(
      `   - [${page.type}] ${page.title}  (${page.sources.length} sources, access: ${
        page.accessibleBy.join(', ') || 'nobody'
      })`,
    );
  }
  for (const edge of edges) {
    lines.push(
      `     ${edge.fromSlug} —${edge.kind}→ ${edge.toSlug}  [${edge.origin}]`,
    );
  }
  if (unverified.length > 0 && showDropped > 0) {
    lines.push('   dropped (quote not found in the source):');
    for (const claim of unverified.slice(0, showDropped)) {
      lines.push(
        `     × ${claim.entityTitle}: ${clip(claim.statement, 90)}`,
        `       „${clip(claim.quote, 140)}”`,
      );
    }
    if (unverified.length > showDropped) {
      lines.push(`     … and ${unverified.length - showDropped} more`);
    }
  }
  return lines.join('\n');
}

export function renderTotals(totals: PreviewTotals, written: boolean): string {
  return [
    '## Totals',
    `   documents: ${totals.documents} (${totals.extracted} extracted, ${totals.failed} failed, ${totals.notAttempted} not attempted)`,
    `   candidate pages: ${totals.pages}`,
    `   claims: ${totals.keptClaims} kept, ${totals.droppedClaims} dropped — drop rate ${percent(dropRate(totals))}`,
    `   malformed items (failed their limits): ${totals.rejectedItems}`,
    `   edges: ${totals.edges.EXTRACTED} extracted, ${totals.edges.AMBIGUOUS} ambiguous, ${totals.edges.INFERRED} inferred`,
    `   tokens: ${totals.tokens}`,
    written
      ? '   written: yes — candidates are in the review queue'
      : '   written: no (dry run; pass --write to persist)',
  ].join('\n');
}
