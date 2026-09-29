/**
 * How the jobs load test reports: the Markdown row per run, and the JSON file
 * with every run so far. Separate from the script so it can be tested without
 * a stack — the script's `main` needs a database, a queue and a worker.
 */

/** The fields of one run the table prints, in its column order. */
export interface ReportRow {
  level: number;
  repetition: number;
  startMs: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  wallMs: number;
  medianQueueWaitMs: number | null;
  medianParseMs: number | null;
  medianEmbedMs: number | null;
  failures: number;
}

export const TABLE_HEADER =
  '| level | rep | start (ms) | min | p50 | p95 | max | wall | queue wait | parse | embed | failures |';

export function tableRow(result: ReportRow): string {
  const cells = [
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
  ].join(' | ');
  return `| ${cells} |`;
}

export function table(results: ReportRow[]): string {
  const divider = '| --- '.repeat(12) + '|';
  return [TABLE_HEADER, divider, ...results.map(tableRow)].join('\n');
}

/**
 * Everything measured so far, on disk. Written after every run, not once at
 * the end: a batch of real PDFs takes minutes, and a run stopped halfway —
 * by an abort, a timeout or a person — used to lose every repetition that had
 * already finished, because the table only existed in memory until `main`
 * returned. `complete` says whether the file is the whole matrix.
 */
export async function writeResults(
  path: string,
  runtime: string,
  results: readonly unknown[],
  complete: boolean,
): Promise<void> {
  // Written beside the report and renamed over it: `writeFile` can take
  // several writes, so a run stopped mid-write would otherwise leave a
  // truncated file in place of the repetitions it was meant to keep.
  const { rename, writeFile } = await import('node:fs/promises');
  const partial = `${path}.partial`;
  await writeFile(
    partial,
    JSON.stringify({ runtime, complete, results }, null, 2),
    'utf8',
  );
  await rename(partial, path);
}
