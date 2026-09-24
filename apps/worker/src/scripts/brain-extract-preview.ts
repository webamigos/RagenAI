/* eslint-disable no-console */
/**
 * Ragen Brain's extraction preview (spec B5): run extraction over one
 * organization's documents and print what it produced — pages, the claims
 * kept, the claims dropped and why, edges by origin, tokens — so quality can
 * be judged on our own documents before any review interface exists.
 *
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/brain-extract-preview.ts \
 *     --org <org id> --project <project id> --limit 5 --json tmp/brain.json
 *
 * From the repository root: `--env-file` loads DATABASE_URL and the provider
 * credentials for BRAIN_EXTRACT_MODEL from the root `.env.local`. `--help`
 * prints the options.
 *
 * **It runs the job's code, not a copy of it.** Each document goes through
 * `extractFile` — the first half of the `extractDocumentCandidates` activity
 * — and `--write` hands the result to `persistExtraction`, its second half. A
 * preview that exercised another path would have no oracle: whatever it
 * printed, the job could still do something else.
 *
 * What it costs and what it touches:
 *
 * - **Real model calls**, recorded as AI usage against the organization like
 *   the job's. The run budget is the job's (`BRAIN_EXTRACT_MAX_TOKENS`) unless
 *   `--max-tokens` says otherwise.
 * - **Dry run by default.** Nothing but those usage rows is written.
 * - **`--write` needs the organization's `brain` flag on**, checked the way
 *   the job checks it. Candidates are curation-visible state; the flag is what
 *   says this organization has asked for them.
 * - **It prints document text** — statements and quotes — to your terminal.
 *   Run it on organizations whose documents you may read.
 */
import { randomUUID } from 'node:crypto';

import {
  extractFile,
  persistExtraction,
} from '../activities/brain/extract-document-candidates.js';
import { startBrainExtractRun } from '../activities/brain/start-brain-extract-run.js';
import { BRAIN_EXTRACT_MAX_TOKENS } from '../consts.js';
import { getPrisma } from '../services/db/prisma.js';
import {
  PREVIEW_USAGE,
  PreviewUsageError,
  parsePreviewOptions,
  renderRow,
  renderTotals,
  totalsOf,
  type PreviewRow,
} from './brain-preview-report.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log(PREVIEW_USAGE);
    return;
  }
  const options = parsePreviewOptions(
    argv,
    process.env,
    BRAIN_EXTRACT_MAX_TOKENS,
  );

  if (options.write) {
    const run = await startBrainExtractRun({ orgId: options.orgId });
    if (!run.enabled) {
      throw new PreviewUsageError(
        `brain is off for ${options.orgId}, so --write would put candidates ` +
          'in front of an organization that has not asked for them. Turn the ' +
          'flag on for it in the admin panel, or drop --write for a dry run.',
      );
    }
  }

  // --file wins over --project: naming files is the more specific ask.
  let scope: { id?: { in: string[] }; projectId?: string } = {};
  if (options.fileIds.length > 0) {
    scope = { id: { in: options.fileIds } };
  } else if (options.projectId) {
    scope = { projectId: options.projectId };
  }
  const files = await getPrisma().userFile.findMany({
    where: {
      organizationId: options.orgId,
      documentId: { not: null },
      ...scope,
    },
    select: { id: true, fileName: true },
    orderBy: { createdAt: 'desc' },
    take: options.limit,
  });
  if (files.length === 0) {
    console.log('No parsed documents match. Nothing to extract.');
    return;
  }

  const runId = `brain-preview-${randomUUID()}`;
  console.log(
    `# Brain extraction preview — ${files.length} documents, ` +
      `budget ${options.maxTokens} tokens, ${options.write ? 'WRITING' : 'dry run'}\n`,
  );

  const rows: PreviewRow[] = [];
  let spent = 0;
  let skipped = 0;
  for (const file of files) {
    const left = options.maxTokens - spent;
    if (left <= 0) {
      skipped += 1;
      continue;
    }
    const result = await extractFile({
      orgId: options.orgId,
      fileId: file.id,
      maxTokens: left,
      runId,
    });
    spent += result.tokens;
    if (options.write) {
      await persistExtraction(
        { orgId: options.orgId, fileId: file.id, runId },
        result,
      );
    }
    const row = { fileId: file.id, fileName: file.fileName, result };
    rows.push(row);
    console.log(`${renderRow(row, options.showDropped)}\n`);
  }

  console.log(renderTotals(totalsOf(rows, skipped), options.write));

  if (options.json) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      options.json,
      JSON.stringify(
        { runId, options, totals: totalsOf(rows, skipped), rows },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`\nwrote ${options.json}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    if (error instanceof PreviewUsageError) {
      console.error(`${error.message}\n\n${PREVIEW_USAGE}`);
      process.exit(2);
    }
    // The class and the stack frames, never the message: a provider error's
    // message can quote the request, which is the document. The frames are
    // enough to find where it came from.
    const name = error instanceof Error ? error.name : 'Error';
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(
      `${name}${stack ? `\n${stack.split('\n').slice(1).join('\n')}` : ''}`,
    );
    process.exit(1);
  });
