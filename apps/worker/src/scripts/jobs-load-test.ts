/* eslint-disable no-console */
/**
 * The load test the worker-runtime spec's D2 asks for, and the one the
 * 2026-09-05 measurement asked someone to write next.
 *
 * ## What it does
 *
 * Creates a throwaway project in an organization you name, uploads N synthetic
 * plain-text files, starts N `runFileEmbeddings` runs **through the seam**, and
 * waits for every one of them to finish — against the real stack: real
 * embeddings, real summary and RAG-score calls, real Qdrant, real Presidio.
 * Then it deletes what it made and prints the numbers.
 *
 *   LOAD_TEST_ORG_ID=<org id> npx tsx src/scripts/jobs-load-test.ts \
 *     --levels 1,5,20 --repetitions 3 --json ../../tmp/bullmq.json
 *
 * `WORKER_RUNTIME` chooses the engine, exactly as it does for a deployment —
 * **and the worker you are running has to agree**, because a producer writes
 * to one engine only. The script prints the runtime it resolved and refuses to
 * guess; if nothing consumes what it enqueues, every run times out and the
 * numbers describe a misconfiguration.
 *
 * ## Why it is shaped like this rather than like the 2026-09-05 script
 *
 * That run measured 20 concurrent ingests, twice, and its own lesson refused
 * to call 20 a safe ceiling — because it had **no lower-concurrency baseline**
 * and **no repetitions**, so "~2x the median at the tail" could not be
 * attributed to concurrency rather than to a slow afternoon on a shared
 * provider. This one takes a list of levels (a single file is a level) and a
 * repetition count, so a difference between two runtimes can be told apart
 * from a difference between two moments.
 *
 * It also splits each file's time into **queue wait, parse and embed**, taken
 * from the timestamps the pipeline already writes to `user_files`. That is
 * less than the per-activity spans the lesson asked for, and it is the part
 * that needs no new instrumentation — enough to say whether a runtime's cost
 * lands before the work starts (the engine) or inside it (the providers),
 * which is the question D2 is actually asking.
 *
 * ## What it deletes, stated plainly
 *
 * The project it created, the files it created, their documents, their
 * vectors, and the `ai_usage` rows for that project. **It never deletes an
 * organization and never deletes a Qdrant collection** — the collection is
 * per-organization and shared with every real document in it. The 2026-09-05
 * script dropped a whole throwaway organization; pointing that at a working
 * organization by accident is a worse failure than leaving a few rows behind,
 * so this one is narrower and tells you what it could not remove.
 */
import { randomUUID } from 'node:crypto';

import { resolveWorkerRuntime } from '@ragenai/jobs';

import { deleteDocumentVectors } from '../activities/meilisearch/delete-document-vectors.js';
import { aws } from '../services/aws.js';
import { getPrisma } from '../services/db/prisma.js';
import { jobs } from '../jobs.js';

interface Options {
  levels: number[];
  repetitions: number;
  words: number;
  json: string | undefined;
  keep: boolean;
}

/** One file's life, in milliseconds from the moment the batch was enqueued. */
interface FileTiming {
  fileId: string;
  /** Enqueue → the pipeline's first status write. The engine's own latency. */
  queueWaitMs: number | null;
  parseMs: number | null;
  embedMs: number | null;
  /** Enqueue → embedding completed. What a user waits. */
  totalMs: number | null;
  failed: boolean;
}

interface RunResult {
  level: number;
  repetition: number;
  /** How long the N `start()` calls themselves took. */
  startMs: number;
  wallMs: number;
  failures: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  medianQueueWaitMs: number | null;
  medianParseMs: number | null;
  medianEmbedMs: number | null;
  files: FileTiming[];
  /**
   * Every file this run created, which is **not** the same list as `files`.
   *
   * `files` is built from the rows that came back, so a run that timed out —
   * or whose row was deleted underneath it — describes fewer files than it
   * made. Cleaning up from that list leaves the difference behind: an object
   * in storage and a row in the database, in a real organization, from the
   * run that went wrong. The created ids are what gets cleaned.
   */
  created: string[];
}

const POLL_INTERVAL_MS = 500;
const RUN_TIMEOUT_MS = 15 * 60_000;

/**
 * The run stopped with jobs possibly still live, so nothing is deleted.
 *
 * Cleaning up underneath a running ingest is the one thing worse than leaving
 * rows behind: the handler is mid-pipeline, and a delete races its writes —
 * chunks land in the collection after the delete that was meant to remove
 * them, and the leftovers are now invisible, because the row that named them
 * is gone. A failed measurement is cheap; orphaned vectors in a real
 * organization's collection are not.
 *
 * So the ids travel with the error, the script prints them, and a person
 * decides once the queue is quiet.
 */
class LoadTestAborted extends Error {
  constructor(
    message: string,
    readonly orgId: string,
    readonly fileIds: string[],
  ) {
    super(message);
    this.name = 'LoadTestAborted';
  }
}

function parseOptions(argv: string[]): Options {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };

  const levels = (value('--levels') ?? '1,5,20')
    .split(',')
    .map((raw) => Number(raw.trim()));

  if (levels.some((level) => !Number.isInteger(level) || level < 1)) {
    throw new Error(
      '--levels takes a comma-separated list of positive integers',
    );
  }

  const repetitions = Number(value('--repetitions') ?? '3');
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error('--repetitions takes a positive integer');
  }

  // Same treatment as the other two. `Number('abc')` is NaN, and
  // `while (count < NaN)` is false on the first check — so an unvalidated
  // value produces a file with no content at all, ingested successfully, and a
  // measurement of how fast the pipeline embeds nothing.
  const words = Number(value('--words') ?? '500');
  if (!Number.isInteger(words) || words < 1) {
    throw new Error('--words takes a positive integer');
  }

  return {
    levels,
    repetitions,
    words,
    json: value('--json'),
    keep: argv.includes('--keep'),
  };
}

/**
 * A document with enough real words to be worth embedding.
 *
 * Deliberately not lorem ipsum: the summary and RAG-score calls are real LLM
 * calls, and a model handed gibberish can answer faster than one handed prose,
 * which would flatter every measurement equally and hide a difference.
 */
const SENTENCES = [
  'The service agreement covers maintenance, support and the response times each severity level carries.',
  'Invoices are issued monthly in arrears and are payable within fourteen days of receipt.',
  'Either party may terminate this agreement with thirty days written notice.',
  'Personal data is processed only for the purposes described in the appendix.',
  'The supplier maintains a backup of every production database with a retention of thirty days.',
  'Changes to scope are agreed in writing and priced before any work begins.',
];

function syntheticDocument(words: number): string {
  const out: string[] = [];
  let count = 0;
  let index = 0;

  while (count < words) {
    const sentence = SENTENCES[index % SENTENCES.length]!;
    out.push(sentence);
    count += sentence.split(' ').length;
    index += 1;
  }

  return out.join(' ');
}

const percentile = (sorted: number[], fraction: number): number =>
  sorted.length === 0
    ? 0
    : sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
      ]!;

const median = (values: (number | null)[]): number | null => {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  return percentile(
    [...present].sort((a, b) => a - b),
    0.5,
  );
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

async function runOnce(
  orgId: string,
  projectId: string,
  level: number,
  repetition: number,
  words: number,
): Promise<RunResult> {
  const prisma = getPrisma();
  const content = Buffer.from(syntheticDocument(words), 'utf8');
  const fileIds: string[] = [];

  try {
    for (let index = 0; index < level; index++) {
      const fileId = randomUUID();
      const fileName = `load-${fileId}.txt`;

      // Recorded *before* the first write that can leave something behind. An
      // upload that succeeds and a row insert that fails would otherwise leave
      // an object nothing knows about — the id has to be on the cleanup list
      // before it exists anywhere else.
      fileIds.push(fileId);

      await aws.uploadToS3(orgId, `${fileId}.txt`, content);
      await prisma.userFile.create({
        data: {
          id: fileId,
          organizationId: orgId,
          projectId,
          fileName,
          fileSize: content.byteLength,
          fileType: 'TEXT',
          isBinaryFile: false,
          isUploaded: true,
          uploadedAt: new Date(),
          // Every producer persists what it knows *before* enqueueing — the
          // rule C4b arrived at, when four producers were found writing after
          // the start. The handler reads this row rather than a payload copy.
          workflowId: fileId,
        },
      });
    }
  } catch (error) {
    // Nothing has been enqueued yet, so nothing is running and cleaning up is
    // safe — which is exactly why this path cleans up and the ones below do
    // not.
    await cleanup(orgId, fileIds);
    throw error;
  }

  const enqueuedAt = Date.now();
  try {
    await Promise.all(
      fileIds.map((fileId) =>
        jobs().start('runFileEmbeddings', fileId, { fileId, orgId }),
      ),
    );
  } catch (error) {
    throw new LoadTestAborted(
      `could not enqueue every run (${error instanceof Error ? error.message : String(error)}). Some of these files may already be running, so nothing was deleted.`,
      orgId,
      fileIds,
    );
  }
  const startMs = Date.now() - enqueuedAt;

  const deadline = Date.now() + RUN_TIMEOUT_MS;
  let rows: Awaited<ReturnType<typeof prisma.userFile.findMany>> = [];
  let finished = false;

  while (Date.now() < deadline) {
    rows = await prisma.userFile.findMany({
      where: { id: { in: fileIds }, organizationId: orgId },
    });

    // A file is finished when its embedding reached a terminal state — or
    // when parsing failed, because embedding never starts after that and
    // waiting for a status that will not be written is how a load test hangs
    // for its full timeout and reports nothing.
    // `every` on an empty (or short) array is true, so the length check is not
    // a belt-and-braces addition: a row deleted mid-run — or a query that came
    // back with fewer than were created — would otherwise read as "everything
    // finished", and the batch would be reported from the files that happened
    // to be there.
    const done =
      rows.length === fileIds.length &&
      rows.every(
        (row) =>
          TERMINAL.has(row.embeddingStatus) ||
          row.parsingStatus === 'FAILED' ||
          row.parsingStatus === 'CANCELLED',
      );

    if (done) {
      finished = true;
      break;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (!finished) {
    // A run still moving at the deadline is a measurement that failed, and the
    // jobs behind it are still live. Reporting its numbers would be worse than
    // stopping: they describe a batch that never finished, and the usual next
    // step — clean up and carry on — would delete rows out from under a
    // running pipeline. The commonest cause is the worker being on the other
    // runtime, in which case nothing ever consumed these at all.
    throw new LoadTestAborted(
      `level ${level}, repetition ${repetition}: the runs had not finished after ${RUN_TIMEOUT_MS}ms. Check that a worker is running with the same WORKER_RUNTIME. Nothing was deleted.`,
      orgId,
      fileIds,
    );
  }

  const wallMs = Date.now() - enqueuedAt;

  const span = (from: Date | null, to: Date | null): number | null =>
    from && to ? to.getTime() - from.getTime() : null;

  const files: FileTiming[] = rows.map((row) => ({
    fileId: row.id,
    queueWaitMs: row.parsingStartedAt
      ? row.parsingStartedAt.getTime() - enqueuedAt
      : null,
    parseMs: span(row.parsingStartedAt, row.parsingCompletedAt),
    embedMs: span(row.embeddingStartedAt, row.embeddingCompletedAt),
    totalMs: row.embeddingCompletedAt
      ? row.embeddingCompletedAt.getTime() - enqueuedAt
      : null,
    failed: row.embeddingStatus !== 'COMPLETED',
  }));

  const totals = files
    .map((file) => file.totalMs)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  return {
    level,
    repetition,
    startMs,
    wallMs,
    failures: files.filter((file) => file.failed).length,
    min: totals[0] ?? 0,
    p50: percentile(totals, 0.5),
    p95: percentile(totals, 0.95),
    max: totals[totals.length - 1] ?? 0,
    medianQueueWaitMs: median(files.map((file) => file.queueWaitMs)),
    medianParseMs: median(files.map((file) => file.parseMs)),
    medianEmbedMs: median(files.map((file) => file.embedMs)),
    files,
    created: fileIds,
  };
}

/**
 * Remove what this run created, and say what survived.
 *
 * Between repetitions as well as at the end: chunks left in the collection are
 * a growing haystack for every later run's writes, which would make the last
 * level look slower than the first for reasons that have nothing to do with
 * the runtime.
 */
async function cleanup(orgId: string, fileIds: string[]): Promise<void> {
  const prisma = getPrisma();

  for (const fileId of fileIds) {
    try {
      await deleteDocumentVectors({ orgId, fileId });
    } catch (error) {
      console.warn(`could not delete vectors for ${fileId}:`, error);
    }

    try {
      // The upload is the one thing that outlives the database row: deleting
      // the row leaves the object, and nothing ever looks at it again. On a
      // local provider that is a directory quietly filling up; on S3 it is a
      // bill. Same key the upload used — `${orgId}/${fileId}.txt`.
      await aws.deleteFromS3(orgId, `${fileId}.txt`);
    } catch (error) {
      console.warn(`could not delete the stored file for ${fileId}:`, error);
    }

    try {
      await prisma.userDocument.deleteMany({
        where: { fileId, organizationId: orgId },
      });
      await prisma.userFile.deleteMany({
        where: { id: fileId, organizationId: orgId },
      });
    } catch (error) {
      console.warn(
        `could not delete rows for ${fileId} — remove it by hand:`,
        error,
      );
    }
  }
}

function table(results: RunResult[]): string {
  const header =
    '| level | rep | start (ms) | min | p50 | p95 | max | wall | queue wait | parse | embed | failures |';
  const divider = '| --- '.repeat(12) + '|';
  const rows = results.map((result) =>
    [
      result.level,
      result.repetition,
      result.startMs,
      result.min,
      result.p50,
      result.p95,
      result.max,
      result.wallMs,
      result.medianQueueWaitMs ?? '—',
      result.medianParseMs ?? '—',
      result.medianEmbedMs ?? '—',
      result.failures,
    ].join(' | '),
  );

  return [header, divider, ...rows.map((row) => `| ${row} |`)].join('\n');
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const orgId = process.env.LOAD_TEST_ORG_ID?.trim();

  if (!orgId) {
    throw new Error(
      'LOAD_TEST_ORG_ID is not set. This script writes files into a real organization and deletes them again — it will not guess which one.',
    );
  }

  const runtime = resolveWorkerRuntime();
  console.log(
    `runtime: ${runtime} — the worker consuming these jobs must be running with the same WORKER_RUNTIME, or every run below will time out.`,
  );

  const prisma = getPrisma();
  const project = await prisma.project.create({
    data: {
      title: `load-test ${new Date().toISOString()}`,
      organizationId: orgId,
    },
  });
  console.log(`project: ${project.id}`);

  const results: RunResult[] = [];
  // An abort leaves live jobs behind, so it also leaves everything they touch:
  // the project, the rows and the vectors stay until a person looks.
  let retain = options.keep;

  try {
    for (const level of options.levels) {
      for (
        let repetition = 1;
        repetition <= options.repetitions;
        repetition++
      ) {
        console.log(`running level ${level}, repetition ${repetition}…`);
        const result = await runOnce(
          orgId,
          project.id,
          level,
          repetition,
          options.words,
        );
        results.push(result);

        if (!options.keep) {
          await cleanup(orgId, result.created);
        }
      }
    }
  } catch (error) {
    if (error instanceof LoadTestAborted) {
      retain = true;
      console.error(`\naborted: ${error.message}`);
      console.error(
        `project ${project.id} and these files were left in place, because the jobs behind them may still be running:\n  ${error.fileIds.join('\n  ')}`,
      );
      console.error(
        'Once the queue is quiet, delete the files in the UI or drop the project; their vectors go with the files.',
      );
    }
    throw error;
  } finally {
    if (!retain) {
      try {
        // Both filtered by organization as well as by id — not because the
        // project id is ambiguous (it is a uuid), but because the tenant-scope
        // guard warns on every query that omits it, and a script that prints
        // two warnings per run teaches the reader to ignore the guard. The
        // delete becomes `deleteMany` for the same reason: `delete` takes a
        // unique selector, which cannot carry a second column.
        await prisma.aiUsage.deleteMany({
          where: { projectId: project.id, organizationId: orgId },
        });
        await prisma.project.deleteMany({
          where: { id: project.id, organizationId: orgId },
        });
      } catch (error) {
        console.warn(
          `could not delete project ${project.id} — remove it by hand:`,
          error,
        );
      }
    }
  }

  console.log(`\n### ${runtime}\n`);
  console.log(table(results));

  if (options.json) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      options.json,
      JSON.stringify({ runtime, results }, null, 2),
      'utf8',
    );
    console.log(`\nwrote ${options.json}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
