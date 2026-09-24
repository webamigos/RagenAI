/* eslint-disable no-console */
/**
 * Ragen Brain's extraction eval: the job's extraction, run over the
 * bilingual fixture corpora already in the repository, measured on the three
 * gaps the first B5 run found (see `brain-eval-metrics.ts`).
 *
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/brain-extract-eval.ts \
 *     --repeats 2 --json tmp/brain-eval-before.json
 *
 * Run it before a change and after, on the same corpus, and compare — the
 * model is not deterministic, so one run of each is an anecdote (ADR-20).
 *
 * It calls the model through `structuredGenerator`, the binding the job
 * uses, and through `extractDocument` and `assembleCandidates`, the job's own
 * rules. What differs from the job is only the source of the text — files
 * rather than a document version — so no database is needed. Nothing is
 * written anywhere, and no AI usage is recorded: this is our cost, not an
 * organization's.
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  assembleCandidates,
  ExtractionBudget,
  extractDocument,
} from '@ragenai/brain-core';

import { structuredGenerator } from '../activities/brain/structured-generator.js';
import { BRAIN_EXTRACT_MODEL } from '../consts.js';
import { getChatModel } from '../services/llm/provider.js';
import {
  measure,
  summarize,
  type DocMetrics,
  type EvalLanguage,
} from './brain-eval-metrics.js';

const REPO = join(import.meta.dirname, '..', '..', '..', '..');
const CORPORA = join(REPO, 'apps', 'web', 'evals');

/** Every text fixture that is a document, with its language. */
const CORPUS: { path: string; language: EvalLanguage }[] = [
  ...[
    'pl-01-regulamin-zwrotow',
    'pl-02-regulamin-bagazu',
    'pl-03-polityka-opoznien',
    'pl-04-protokol-zarzadu',
    'en-01-refund-policy',
    'en-02-baggage-policy',
    'en-03-delay-compensation',
    'en-04-board-minutes',
  ].map((name) => ({
    path: join(
      CORPORA,
      'rag-benchmark',
      'corpora',
      'kolej-bilingual-v1',
      'docs',
      `${name}.md`,
    ),
    language: name.slice(0, 2) as EvalLanguage,
  })),
  ...[
    'pl-01-limity-sprzetowe',
    'pl-02-stawki-serwisowe',
    'en-01-equipment-limits',
    'en-02-service-rates',
  ].map((name) => ({
    path: join(
      CORPORA,
      'rag-benchmark',
      'corpora',
      'tabele-bilingual-v1',
      'docs',
      `${name}.md`,
    ),
    language: name.slice(0, 2) as EvalLanguage,
  })),
  {
    path: join(
      CORPORA,
      'e2e-rag',
      'fixtures',
      'regulamin-wilczy-mlyn.source.txt',
    ),
    language: 'pl',
  },
];

function option(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const pct = (v: number | null) =>
  v === null ? '—' : `${(v * 100).toFixed(1)}%`;

async function main() {
  const repeats = Number(option('--repeats') ?? '2');
  const only = option('--only');
  const docs = CORPUS.filter((d) => !only || basename(d.path).includes(only));
  const generate = structuredGenerator(await getChatModel(BRAIN_EXTRACT_MODEL));

  const runs: {
    doc: string;
    repeat: number;
    language: EvalLanguage;
    metrics: DocMetrics | null;
    tokens: number;
    failure?: string;
    dropped?: { statement: string; quote: string }[];
  }[] = [];

  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const doc of docs) {
      const text = readFileSync(doc.path, 'utf8');
      const outcome = await extractDocument({
        fileName: basename(doc.path),
        text,
        // What ingest writes to UserFile.language (ISO 639-3), so the eval
        // gives the model what the job would.
        language: doc.language === 'pl' ? 'pol' : 'eng',
        generate,
        budget: new ExtractionBudget({ maxDocuments: 1, maxTokens: 200_000 }),
      });
      const tokens = outcome.usage.inputTokens + outcome.usage.outputTokens;
      if (outcome.status !== 'extracted') {
        runs.push({
          doc: basename(doc.path),
          repeat,
          language: doc.language,
          metrics: null,
          tokens,
          failure:
            outcome.status === 'failed' ? outcome.reason : outcome.status,
        });
        console.log(`${repeat} ${basename(doc.path)}: ${outcome.status}`);
        continue;
      }
      const assembled = assembleCandidates(
        {
          organizationId: 'eval',
          fileId: '00000000-0000-0000-0000-000000000000',
          documentVersionId: '00000000-0000-0000-0000-000000000000',
          text,
          principals: ['org:eval'],
        },
        outcome.windows,
      );
      const metrics = measure(assembled, doc.language);
      runs.push({
        doc: basename(doc.path),
        repeat,
        language: doc.language,
        metrics,
        tokens,
        // The dropped claims themselves: a drop rate that moves needs its
        // cause read, not guessed. Fixture text only, never customer text.
        dropped: assembled.unverified,
      });
      console.log(
        `${repeat} ${basename(doc.path)}: ${metrics.pages} pages, ${metrics.claims} claims, ` +
          `${metrics.descriptionsInOtherLanguage}/${metrics.descriptions} wrong-language, ` +
          `${metrics.shortQuotes} short, ${metrics.edges} edges (${metrics.edgesExtracted} extracted)`,
      );
    }
  }

  const all = summarize(runs);
  const byLanguage = (l: EvalLanguage) =>
    summarize(runs.filter((r) => r.language === l));
  console.log(
    `\n## ${BRAIN_EXTRACT_MODEL}, ${docs.length} documents × ${repeats}`,
  );
  for (const [label, s] of [
    ['all', all],
    ['pl', byLanguage('pl')],
    ['en', byLanguage('en')],
  ] as const) {
    console.log(
      `${label.padEnd(4)} failed ${s.failed}/${s.documents} · pages ${s.pages} · claims ${s.claims} · ` +
        `drop ${pct(s.dropRate)} · wrong-language ${pct(s.wrongLanguageRate)} · ` +
        `short quotes ${pct(s.shortQuoteRate)} · edges/doc ${s.edgesPerDocument.toFixed(2)} ` +
        `(extracted ${pct(s.extractedEdgeShare)}) · tokens ${s.tokens}`,
    );
  }

  const json = option('--json');
  if (json) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      json,
      JSON.stringify(
        { model: BRAIN_EXTRACT_MODEL, repeats, all, runs },
        null,
        2,
      ),
    );
    console.log(`\nwrote ${json}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? `${error.name}\n${error.stack}` : error,
    );
    process.exit(1);
  });
