/* eslint-disable no-console */
/**
 * Measure Brain's contradiction judge (spec C1) on labelled pairs, per ADR-20:
 * a prompt is changed against numbers, not against a demo.
 *
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/brain-contradiction-eval.ts \
 *     --repeats 3 [--json out.json]
 *
 * Runs `judgeContradictions` through `structuredGenerator` — the binding the
 * job uses — on `fixtures/brain-contradiction-cases.ts`, and reports recall
 * (a planted contradiction found), the false-alarm rate (anything reported
 * on a pair that must come back clean) and item precision. Fixture text
 * only; no database, no customer document.
 */
import {
  ExtractionBudget,
  judgeContradictions,
  type JudgedPage,
} from '@ragenai/brain-core';

import { structuredGenerator } from '../activities/brain/structured-generator.js';
import { BRAIN_EXTRACT_MODEL } from '../consts.js';
import { getChatModel } from '../services/llm/provider.js';
import {
  B_OFFSET,
  scoreCase,
  summarizeCases,
  type CaseResult,
} from './brain-contradiction-metrics.js';
import { CONTRADICTION_CASES } from './fixtures/brain-contradiction-cases.js';

const ISO_639_3 = { pl: 'pol', en: 'eng' } as const;

function option(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const pct = (v: number | null) =>
  v === null ? '—' : `${(v * 100).toFixed(1)}%`;

async function main() {
  const repeats = Number(option('--repeats') ?? '3');
  const generate = structuredGenerator(await getChatModel(BRAIN_EXTRACT_MODEL));
  const results: (CaseResult & { repeat: number; texts: string[] })[] = [];
  let tokens = 0;

  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const c of CONTRADICTION_CASES) {
      // What ingest writes to UserFile.language, as the loader passes it.
      const iso = c.language === null ? null : ISO_639_3[c.language];
      const side = (quotes: string[], offset: number): JudgedPage => ({
        title: 'Subject',
        language: iso,
        claims: quotes.map((quote, i) => ({ sourceId: offset + i + 1, quote })),
      });
      const outcome = await judgeContradictions({
        a: side(c.a, 0),
        b: side(c.b, B_OFFSET),
        generate,
        budget: new ExtractionBudget({ maxDocuments: 1, maxTokens: 100_000 }),
      });
      tokens += outcome.usage.inputTokens + outcome.usage.outputTokens;
      const reported =
        outcome.status === 'judged' ? outcome.contradictions : null;
      const score = scoreCase(c, reported);
      results.push({
        ...score,
        repeat,
        texts: (reported ?? []).map((r) => r.explanation),
      });
      const verdict = score.failed
        ? `failed (${outcome.status === 'failed' ? outcome.reason : outcome.status})`
        : `${score.hits}/${score.expected} hit, ${score.extra} extra`;
      console.log(`${repeat} ${c.name}: ${verdict}`);
    }
  }

  const s = summarizeCases(results);
  console.log(
    `\n## ${BRAIN_EXTRACT_MODEL}, ${CONTRADICTION_CASES.length} pairs × ${repeats}\n` +
      `recall ${pct(s.recall)} · false alarms ${pct(s.falseAlarmRate)} · ` +
      `precision ${pct(s.precision)} · wrong-language ${pct(s.wrongLanguageRate)} · failed ${s.failed}/${s.runs} · tokens ${tokens}`,
  );

  const json = option('--json');
  if (json) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      json,
      JSON.stringify(
        { model: BRAIN_EXTRACT_MODEL, repeats, summary: s, tokens, results },
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
