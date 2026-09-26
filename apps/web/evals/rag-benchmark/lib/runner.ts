import type { PrismaClient } from '../../../src/generated/prisma/client';
import { ARMS } from './report';
import type { Arm, DocumentScore } from './types';

/**
 * The parts of `run.ts` that are decisions rather than I/O orchestration, kept
 * here so they can be tested without a live stack. `run.ts` itself needs a
 * running app, a seeded database and a proxy; nothing in this file does.
 */

export interface ParsedArgs {
  corpus: string;
  arms: Arm[];
}

/**
 * `--corpus <dir>` and `--arms rag,no-rag`.
 *
 * An unknown arm is rejected rather than cast. `argv.split(',') as Arm[]` is a
 * lie the compiler cannot catch: a typo like `--arms rag,norag` used to run one
 * arm and then report the missing one as an empty column, which reads as a
 * control that scored nothing rather than as a control that never ran.
 */
export function parseArgs(
  argv: string[],
  defaultCorpusDir: string,
): ParsedArgs {
  const corpus = valueOf(argv, '--corpus') ?? defaultCorpusDir;

  const arms = valueOf(argv, '--arms');
  if (arms === undefined) {
    return { corpus, arms: [...ARMS] };
  }

  const requested = arms
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  const unknown = requested.filter((a) => !ARMS.includes(a as Arm));
  if (unknown.length > 0) {
    throw new Error(
      `--arms: unknown arm(s) ${unknown.join(', ')}; expected one or more of ${ARMS.join(', ')}`,
    );
  }
  if (requested.length === 0) {
    throw new Error(`--arms: no arms given; expected ${ARMS.join(' and/or ')}`);
  }
  return { corpus, arms: requested as Arm[] };
}

/**
 * The value following `--name`, or `undefined` when there isn't one.
 *
 * A token starting with `--` is the next option, never this one's value:
 * `--corpus --arms rag` used to set the corpus directory to the literal string
 * `--arms`, and the run then failed reporting that it could not load a corpus
 * from it.
 */
function valueOf(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) {
    return undefined;
  }
  const value = argv[idx + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

export interface WaitForIngestOptions {
  timeoutMs: number;
  /** Gap between polls. Only the tests have a reason to change it. */
  pollMs?: number;
  log?: (line: string) => void;
}

/**
 * Block until every uploaded file has finished embedding.
 *
 * Files are matched by **id**, never by name. The benchmark's corpus files have
 * stable, unremarkable names (`en-01-refund-policy.md`), so a name match also
 * picks up rows left behind by an earlier run or uploaded by someone else in
 * the same database — and this loop would then wait on, or declare success
 * from, documents this run never uploaded.
 */
export async function waitForIngest(
  prisma: Pick<PrismaClient, 'userFile'>,
  fileIds: string[],
  opts: WaitForIngestOptions,
): Promise<void> {
  const { timeoutMs, pollMs = 5_000, log = console.log } = opts;
  const deadline = Date.now() + timeoutMs;
  let lastLine = '';

  while (Date.now() < deadline) {
    const files = await prisma.userFile.findMany({
      where: { id: { in: fileIds } },
      select: { fileName: true, parsingStatus: true, embeddingStatus: true },
    });
    const done = files.filter((f) => f.embeddingStatus === 'COMPLETED');
    const failed = files.filter(
      (f) => f.parsingStatus === 'FAILED' || f.embeddingStatus === 'FAILED',
    );
    const line = `${done.length}/${fileIds.length} indexed, ${failed.length} failed`;
    if (line !== lastLine) {
      log(`  ${line}`);
      lastLine = line;
    }
    if (failed.length > 0) {
      throw new Error(
        `Ingestion failed for: ${failed.map((f) => f.fileName).join(', ')}`,
      );
    }
    if (done.length === fileIds.length) {
      return;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(
    `Ingestion did not finish in ${timeoutMs / 1000}s (${lastLine})`,
  );
}

/**
 * What ingest left in `UserFile.metadata` for the RAG score.
 *
 * The key's presence is the signal, not its value: ingest writes
 * `ragScore: null` when the scorer ran and failed, and writes nothing at all
 * until it gets there — which is after the file is already marked
 * `COMPLETED`, so `waitForIngest` returning says nothing about the score.
 */
export function readRagScore(metadata: unknown): Omit<DocumentScore, 'file'> {
  if (!metadata || typeof metadata !== 'object' || !('ragScore' in metadata)) {
    return { state: 'missing' };
  }
  const score = (metadata as { ragScore: unknown }).ragScore;
  if (!score || typeof score !== 'object') {
    return { state: 'failed' };
  }
  const record = score as Record<string, unknown>;
  const total = record.total;
  if (typeof total !== 'number') {
    return { state: 'failed' };
  }
  // Every other numeric field is a rubric dimension; `suggestions` is not.
  const dimensions: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== 'total' && typeof value === 'number') {
      dimensions[key] = value;
    }
  }
  return { state: 'scored', total, dimensions };
}

export interface UploadedDocument {
  /** `UserFile.id`. */
  id: string;
  /** `CorpusDocument.file`. */
  file: string;
}

/**
 * Wait for ingest to write each uploaded file's score, and return them.
 *
 * Never throws for a score that did not arrive: a document ingest could not
 * score is a result, recorded as `missing`, not a reason to lose the run. The
 * wait is bounded for the same reason — a scorer that threw writes nothing,
 * so without a deadline one bad call would hang the benchmark.
 */
export async function waitForScores(
  prisma: Pick<PrismaClient, 'userFile'>,
  uploads: UploadedDocument[],
  opts: WaitForIngestOptions,
): Promise<DocumentScore[]> {
  const { timeoutMs, pollMs = 5_000, log = console.log } = opts;
  const deadline = Date.now() + timeoutMs;
  let lastLine = '';
  let scores: DocumentScore[] = [];

  for (;;) {
    const rows = await prisma.userFile.findMany({
      where: { id: { in: uploads.map((u) => u.id) } },
      select: { id: true, metadata: true },
    });
    scores = uploads.map(({ id, file }) => ({
      file,
      ...readRagScore(rows.find((r) => r.id === id)?.metadata),
    }));
    const written = scores.filter((s) => s.state !== 'missing').length;
    const line = `${written}/${uploads.length} scores written`;
    if (line !== lastLine) {
      log(`  ${line}`);
      lastLine = line;
    }
    if (written === uploads.length || Date.now() >= deadline) {
      return scores;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/**
 * Pair the ids the upload returned with the corpus documents they came from,
 * by file name — the only thing the upload response and the manifest share.
 *
 * Two documents with one base name would make that pairing a guess, and an
 * upload whose stored name matches no document (the app renamed it) would
 * drop that document's score without a word. Both are refused.
 */
export function pairUploads(
  uploaded: { fileName: string; id: string }[],
  documents: { file: string }[],
): UploadedDocument[] {
  const byName = new Map<string, string>();
  for (const doc of documents) {
    const name = doc.file.split('/').pop() ?? doc.file;
    if (byName.has(name)) {
      throw new Error(
        `Two corpus documents share the file name "${name}", so their scores cannot be told apart`,
      );
    }
    byName.set(name, doc.file);
  }
  const unmatched = uploaded.filter(({ fileName }) => !byName.has(fileName));
  if (unmatched.length > 0) {
    throw new Error(
      `The upload stored ${unmatched.map((u) => `"${u.fileName}"`).join(', ')} under a name no corpus document has, so its score cannot be attributed`,
    );
  }
  return uploaded.map(({ fileName, id }) => ({
    id,
    file: byName.get(fileName) as string,
  }));
}
