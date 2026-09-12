/**
 * Multilingual RAG benchmark against a *live* stack.
 *
 * Uploads a corpus through the real ingestion path, asks each question through
 * the real chat endpoint, and asks the same questions of the same model with no
 * documents attached as a control. Writes a dated report to `results/`.
 *
 * Unlike the promptfoo suites next door — which serve a fixed context from an
 * in-memory keyword store and so measure answer quality, never retrieval —
 * every stage here is the production one: rephrase, multi-query expansion,
 * hybrid dense+sparse search, reranking, and the answer prompt.
 *
 * Run it on someone else's documents with `--corpus /path/to/dir`; nothing in
 * this file knows about the corpus that ships with it.
 *
 * See ./README.md for prerequisites.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadCorpus, resolveCorpusDir } from './lib/corpus';
import { askRag, askControl } from './lib/arms';
import { runAssertions, judge } from './lib/grade';
import { renderMarkdown } from './lib/report';
import { withRetry } from './lib/retry';
import type { Arm, CaseResult, Report, StackFingerprint } from './lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_URL = process.env.RAG_EVAL_APP_URL ?? 'http://localhost:3000';
const EMAIL = process.env.RAG_EVAL_EMAIL ?? 'e2e-test@ragen.ai';
const PASSWORD = process.env.RAG_EVAL_PASSWORD ?? 'E2eTestPassword123!';
const PROJECT_ID =
  process.env.RAG_EVAL_PROJECT_ID ?? 'e2e00000-0000-0000-0000-00e2e0000001';
const THREAD_ID =
  process.env.RAG_EVAL_THREAD_ID ?? 'e2e00000-0000-0000-0000-00e2e0000010';
const INGEST_TIMEOUT_MS = Number(process.env.RAG_EVAL_TIMEOUT_MS ?? 600_000);

const LITELLM_URL = process.env.LITELLM_PROXY_URL ?? 'http://localhost:4000';
const LITELLM_KEY = process.env.LITELLM_MASTER_KEY;
/** The control arm and the judge must be named explicitly, so the report can. */
const CONTROL_MODEL =
  process.env.RAG_EVAL_CONTROL_MODEL ?? 'gemini-3-flash-preview';
const JUDGE_MODEL = process.env.RAG_EVAL_JUDGE_MODEL ?? 'gemini-2.5-flash';

function parseArgs(argv: string[]): { corpus: string; arms: Arm[] } {
  const corpusIdx = argv.indexOf('--corpus');
  const corpus =
    corpusIdx >= 0 && argv[corpusIdx + 1]
      ? argv[corpusIdx + 1]
      : join(__dirname, 'corpora', 'kolej-bilingual-v1');

  const armsIdx = argv.indexOf('--arms');
  const arms =
    armsIdx >= 0 && argv[armsIdx + 1]
      ? (argv[armsIdx + 1].split(',') as Arm[])
      : (['rag', 'no-rag'] as Arm[]);

  return { corpus, arms };
}

async function login(): Promise<string> {
  const res = await fetch(`${APP_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: APP_URL },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Sign-in failed (${res.status}): ${await res.text()}`);
  }
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  if (!cookie) {
    throw new Error('Sign-in returned no session cookie');
  }
  return cookie;
}

async function uploadCorpus(
  cookie: string,
  dir: string,
  documents: { file: string; mimeType: string }[],
): Promise<string[]> {
  const form = new FormData();
  const names: string[] = [];
  for (const doc of documents) {
    const bytes = new Uint8Array(readFileSync(join(dir, doc.file)));
    const name = basename(doc.file);
    names.push(name);
    form.append('files', new File([bytes], name, { type: doc.mimeType }));
  }
  form.append('projectId', PROJECT_ID);

  const res = await fetch(`${APP_URL}/api/upload`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: APP_URL },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
  }
  return names;
}

async function waitForIngest(
  prisma: PrismaClient,
  fileNames: string[],
): Promise<void> {
  const deadline = Date.now() + INGEST_TIMEOUT_MS;
  let lastLine = '';
  while (Date.now() < deadline) {
    const files = await prisma.userFile.findMany({
      where: { fileName: { in: fileNames } },
      select: { fileName: true, parsingStatus: true, embeddingStatus: true },
    });
    const done = files.filter((f) => f.embeddingStatus === 'COMPLETED');
    const failed = files.filter(
      (f) => f.parsingStatus === 'FAILED' || f.embeddingStatus === 'FAILED',
    );
    const line = `${done.length}/${fileNames.length} indexed, ${failed.length} failed`;
    if (line !== lastLine) {
      console.log(`  ${line}`);
      lastLine = line;
    }
    if (failed.length > 0) {
      throw new Error(
        `Ingestion failed for: ${failed.map((f) => f.fileName).join(', ')}`,
      );
    }
    if (done.length === fileNames.length) {
      return;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(
    `Ingestion did not finish in ${INGEST_TIMEOUT_MS / 1000}s (${lastLine})`,
  );
}

/**
 * The thread is reused across runs, so its history has to go before the
 * questions and not only after: a model that can see the previous run's
 * answers will "retrieve" from them, and every case passes for the wrong
 * reason.
 */
async function clearThread(
  prisma: PrismaClient,
  opts: { quiet?: boolean } = {},
): Promise<void> {
  const { count } = await prisma.message.deleteMany({
    where: { threadId: THREAD_ID },
  });
  if (!opts.quiet) {
    console.log(`  cleared ${count} thread messages`);
  }
}

/**
 * Delete through the product's own path rather than with `deleteMany`, because
 * that is what removes the Qdrant points too. Leftover points from a previous
 * run would sit in the collection as duplicates and quietly change the next
 * run's ranking.
 */
async function deleteUploadedFiles(
  prisma: PrismaClient,
  fileNames: string[],
): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET;
  const files = await prisma.userFile.findMany({
    where: { fileName: { in: fileNames } },
    select: { id: true, fileName: true, organizationId: true, ownerId: true },
  });

  if (!secret) {
    console.log(
      `  warning: INTERNAL_API_SECRET is unset, so ${files.length} file(s) were left in place. ` +
        'Their Qdrant points will skew the next run — delete them in the UI, or set the secret.',
    );
    return;
  }

  let deleted = 0;
  for (const file of files) {
    const res = await fetch(`${APP_URL}/api/v1/files/${file.id}`, {
      method: 'DELETE',
      headers: {
        'x-internal-secret': secret,
        'x-org-id': file.organizationId ?? '',
        'x-user-id': file.ownerId ?? '',
        'x-project-id': PROJECT_ID,
        Origin: APP_URL,
      },
    });
    if (res.ok) {
      deleted++;
    } else {
      console.log(
        `  warning: could not delete ${file.fileName} (${res.status})`,
      );
    }
  }
  console.log(
    `  deleted ${deleted}/${files.length} uploaded files (and their vectors)`,
  );
}

function fingerprint(): StackFingerprint {
  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      encoding: 'utf8',
    }).trim();
  } catch {
    // Running outside a checkout is fine; the report just says "unknown".
  }
  return {
    date: new Date().toISOString().slice(0, 10),
    gitSha,
    chatModel: process.env.DEFAULT_MODEL ?? '(app default)',
    judgeModel: JUDGE_MODEL,
    rephraseModel: process.env.REPHRASE_MODEL ?? '(app default)',
    embeddingsModel: process.env.EMBEDDINGS_MODEL ?? '(app default)',
    vectorSize: process.env.VECTOR_SIZE ?? '(app default)',
    rerankProvider: process.env.RERANK_PROVIDER ?? '(unset)',
    rerankModel: process.env.RERANK_MODEL ?? '(unset)',
    rerankingEnabled: process.env.FEATURE_FLAG_RERANKING === '1' ? 'on' : 'off',
    multiQueryVariants: process.env.MULTI_QUERY_VARIANT_COUNT ?? '1 (default)',
    appUrl: APP_URL,
  };
}

async function main(): Promise<void> {
  const { corpus: corpusArg, arms } = parseArgs(process.argv.slice(2));
  const dir = resolveCorpusDir(corpusArg, process.cwd());
  const { corpus, questions } = loadCorpus(dir);

  console.log(`Corpus: ${corpus.name} v${corpus.version} (${dir})`);
  console.log(
    `  ${corpus.documents.length} documents, ${questions.length} questions`,
  );
  console.log(`  arms: ${arms.join(', ')}\n`);

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const results: CaseResult[] = [];
  let uploaded: string[] = [];
  let cookie: string | undefined;

  try {
    if (arms.includes('rag')) {
      console.log(`[1/4] Signing in as ${EMAIL}`);
      cookie = await login();

      console.log(`[2/4] Uploading ${corpus.documents.length} documents`);
      uploaded = await uploadCorpus(cookie, dir, corpus.documents);

      console.log('[3/4] Waiting for ingestion');
      await waitForIngest(prisma, uploaded);

      console.log('[4/4] Clearing thread history');
      await clearThread(prisma);
    }

    console.log(
      `\nAsking ${questions.length} questions × ${arms.length} arm(s)\n`,
    );
    for (const q of questions) {
      for (const arm of arms) {
        const started = Date.now();
        const base = {
          questionId: q.id,
          arm,
          lang: q.lang,
          docLang: q.docLang,
          type: q.type,
          question: q.question,
        };
        try {
          const onRetry = (attempt: number, err: unknown) =>
            console.log(
              `  retry ${attempt} [${arm}] ${q.id} — ${String(err).slice(0, 120)}`,
            );

          let answer: string;
          let citedFiles: string[] | undefined;
          const answerStarted = Date.now();
          if (arm === 'rag') {
            const ragAnswer = await withRetry(
              () =>
                askRag({
                  appUrl: APP_URL,
                  threadId: THREAD_ID,
                  cookie: cookie ?? '',
                  question: q.question,
                }),
              { onRetry },
            );
            answer = ragAnswer.text;
            citedFiles = ragAnswer.citedFileIds;
            // Each question is independent: a leftover history would let a
            // later question answer from an earlier answer rather than from
            // the documents.
            await clearThread(prisma, { quiet: true });
          } else {
            answer = await withRetry(
              () =>
                askControl({
                  baseUrl: LITELLM_URL,
                  apiKey: LITELLM_KEY,
                  model: CONTROL_MODEL,
                  question: q.question,
                }),
              { onRetry },
            );
          }

          const answerMs = Date.now() - answerStarted;

          const assertions = runAssertions(q, answer);
          let rubricPassed: boolean | null = null;
          let rubricReason: string | undefined;
          if (q.rubric) {
            const verdict = await withRetry(
              () =>
                judge(q.rubric!, q.question, answer, {
                  baseUrl: LITELLM_URL,
                  apiKey: LITELLM_KEY,
                  model: JUDGE_MODEL,
                }),
              { onRetry },
            );
            rubricPassed = verdict.pass;
            rubricReason = verdict.reason;
          }

          const passed = assertions.passed && rubricPassed !== false;
          results.push({
            ...base,
            answer,
            assertionsPassed: assertions.passed,
            assertionFailures: assertions.failures,
            rubricPassed,
            rubricReason,
            passed,
            citedFiles,
            answerMs,
            durationMs: Date.now() - started,
          });
          console.log(
            `  ${passed ? 'PASS' : 'FAIL'}  [${arm}] ${q.id}` +
              (passed
                ? ''
                : ` — ${[...assertions.failures, rubricReason].filter(Boolean).join('; ').slice(0, 160)}`),
          );
        } catch (err) {
          results.push({
            ...base,
            answer: '',
            assertionsPassed: false,
            assertionFailures: [],
            rubricPassed: null,
            passed: false,
            error: err instanceof Error ? err.message : String(err),
            answerMs: 0,
            durationMs: Date.now() - started,
          });
          console.log(
            `  ERROR [${arm}] ${q.id} — ${String(err).slice(0, 200)}`,
          );
        }
      }
    }
  } finally {
    if (uploaded.length > 0) {
      console.log('\nCleaning up');
      await deleteUploadedFiles(prisma, uploaded).catch((e: unknown) =>
        console.log(`  warning: cleanup failed: ${String(e)}`),
      );
      // Not `.catch(() => undefined)`: a thread left with this run's messages
      // is exactly what makes the *next* run answer from its predecessor's
      // answers instead of from the documents, and every case then passes for
      // the wrong reason. A cleanup that fails has to say so.
      await clearThread(prisma).catch((e: unknown) =>
        console.log(
          `  warning: could not clear the thread (${String(e)}) — clear it before the next run, or its answers will leak into that one`,
        ),
      );
    }
    await prisma.$disconnect();
  }

  const report: Report = {
    corpus: corpus.name,
    corpusVersion: corpus.version,
    fingerprint: fingerprint(),
    results,
  };

  const outDir = join(__dirname, 'results');
  mkdirSync(outDir, { recursive: true });
  // The corpus revision belongs in the file name: correcting a rubric changes
  // what the number means, and two files from the same day that measured
  // different instruments must not overwrite each other.
  const stem = `${report.fingerprint.date}-${corpus.name}-rev${corpus.version}`;
  writeFileSync(join(outDir, `${stem}.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, `${stem}.md`), renderMarkdown(report));
  console.log(`\nWrote results/${stem}.json and results/${stem}.md`);

  const ragResults = results.filter((r) => r.arm === 'rag');
  const ragPassed = ragResults.filter((r) => r.passed).length;
  console.log(
    `\nRAG arm: ${ragPassed}/${ragResults.length} passed` +
      (ragResults.length
        ? ` (${Math.round((ragPassed / ragResults.length) * 100)}%)`
        : ''),
  );
}

main().catch((e: unknown) => {
  console.error('\nERROR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
