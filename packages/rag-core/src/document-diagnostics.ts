/**
 * `UserFile.metadata.diagnostics`: what the worker writes and the panel reads.
 *
 * The worker computes it (`apps/worker/src/services/document-diagnostics.ts`,
 * spec 2026-09-26-rag-readiness-score-review, C1–C2) and apps/web renders it
 * behind the `documentDiagnostics` feature key (C3). It is shared here rather
 * than declared twice because the two sides meet in an untyped JSON column:
 * a check renamed in one copy would render as nothing in the other, and no
 * typecheck would see it.
 *
 * Imports nothing and reads no environment, for the same reason as
 * `./undecodable-text` — the worker's ingest handler runs in a Temporal
 * workflow sandbox, which has no `process`.
 */

export const DIAGNOSTICS_VERSION = 1;

/** Every check, in the order the panel lists them. */
export const DIAGNOSTIC_CHECKS = [
  'markup',
  'table-without-header',
  'fallback-parser',
  'empty-chunks',
  'few-section-paths',
  'over-budget',
  'overlap-duplication',
] as const;

export type DiagnosticCheck = (typeof DIAGNOSTIC_CHECKS)[number];

export type DiagnosticSeverity = 'info' | 'warn';

export type DiagnosticFinding = {
  /** Stable, and the i18n key the panel renders it under. */
  check: DiagnosticCheck;
  /** `warn` is what the list's badge shows; `info` appears only in detail. */
  severity: DiagnosticSeverity;
  detail?: Record<string, number | string>;
};

export type DiagnosticStats = {
  chunkCount: number;
  tableChunkCount: number;
  medianChunkChars: number;
  /**
   * Share of prose chunks carrying a `sectionPath`, or `null` where the parse
   * path produces none — Docling's prose chunks never do, so a 0 there would
   * be a fact about the splitter, not the document.
   */
  sectionPathShare: number | null;
  /** Characters repeated from the previous chunk, over all prose characters. */
  overlapShare: number;
};

export type DocumentDiagnostics = {
  version: typeof DIAGNOSTICS_VERSION;
  computedAt: string;
  findings: DiagnosticFinding[];
  stats: DiagnosticStats;
};

const KNOWN_CHECKS = new Set<string>(DIAGNOSTIC_CHECKS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDetail(value: unknown): Record<string, number | string> | null {
  if (!isRecord(value)) {
    return null;
  }
  const out: Record<string, number | string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' || typeof entry === 'string') {
      out[key] = entry;
    }
  }
  return out;
}

function readFinding(value: unknown): DiagnosticFinding | null {
  if (!isRecord(value)) {
    return null;
  }
  const { check, severity } = value;
  if (typeof check !== 'string' || !KNOWN_CHECKS.has(check)) {
    return null;
  }
  if (severity !== 'info' && severity !== 'warn') {
    return null;
  }
  const detail = readDetail(value.detail);
  return {
    check: check as DiagnosticCheck,
    severity,
    ...(detail ? { detail } : {}),
  };
}

/**
 * The diagnostics on a file's metadata, or `null` when there are none a reader
 * can trust.
 *
 * `null` covers three cases, and the panel treats all three as "not computed",
 * never as "nothing found": a row written before C2 has no key; a run whose
 * checks threw wrote `null`; and a version this code does not know is not
 * guessed at. A finding with a check this release does not know — written by
 * a newer worker — is dropped rather than rendered under a missing label.
 */
export function readDocumentDiagnostics(
  metadata: unknown,
): DocumentDiagnostics | null {
  if (!isRecord(metadata)) {
    return null;
  }
  const raw = metadata.diagnostics;
  if (!isRecord(raw) || raw.version !== DIAGNOSTICS_VERSION) {
    return null;
  }
  if (typeof raw.computedAt !== 'string' || !Array.isArray(raw.findings)) {
    return null;
  }
  const stats = isRecord(raw.stats) ? raw.stats : {};
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

  return {
    version: DIAGNOSTICS_VERSION,
    computedAt: raw.computedAt,
    findings: raw.findings
      .map(readFinding)
      .filter((finding): finding is DiagnosticFinding => finding !== null),
    stats: {
      chunkCount: number(stats.chunkCount),
      tableChunkCount: number(stats.tableChunkCount),
      medianChunkChars: number(stats.medianChunkChars),
      sectionPathShare:
        typeof stats.sectionPathShare === 'number'
          ? stats.sectionPathShare
          : null,
      overlapShare: number(stats.overlapShare),
    },
  };
}

/** The findings a person should act on, in the panel's order. */
export function warningsOf(
  diagnostics: DocumentDiagnostics | null,
): DiagnosticFinding[] {
  if (!diagnostics) {
    return [];
  }
  return sortFindings(
    diagnostics.findings.filter((finding) => finding.severity === 'warn'),
  );
}

/** Warnings first, then by the order of `DIAGNOSTIC_CHECKS`. */
export function sortFindings(
  findings: readonly DiagnosticFinding[],
): DiagnosticFinding[] {
  const rank = (finding: DiagnosticFinding) =>
    (finding.severity === 'warn' ? 0 : 100) +
    DIAGNOSTIC_CHECKS.indexOf(finding.check);
  return [...findings].sort((a, b) => rank(a) - rank(b));
}
