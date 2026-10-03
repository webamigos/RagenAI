/**
 * Measure the personal-memory extraction prompt (spec
 * 2026-09-27-personal-memory-across-threads, C2), per ADR-20: a prompt is
 * changed against numbers, not against a demo.
 *
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/memory-extraction-eval.ts \
 *     --repeats 3 [--json out.json] [--cases id,id] [--kind injection] [--show-ops]
 *
 * Every miss prints the operations the model returned, with the remembered
 * text each ref named; `--show-ops` prints them for every case. `--json`
 * always carries them.
 *
 * Runs the job's own prompt through `structuredGenerator` — the binding
 * `runMemoryExtraction` uses — then the job's parse and plan, on
 * `fixtures/memory-extraction-cases.ts`. Reports keep-precision and
 * drop-recall separately, the organizational-fact drop rate that gates the
 * rollout (E2: ≥ 95%), and how often a "yes, like that" is kept — what
 * leaving the answer out of the extractor costs. Fixture text only; no
 * database, no customer message. Costs one small model call per case per
 * repeat.
 */
import { writeFileSync } from 'node:fs';

import { type z } from 'zod';

import { structuredGenerator } from '../activities/brain/structured-generator.js';
import {
  extractionAnswerSchema,
  parseOperations,
  planMemoryApply,
  type CurrentMemory,
} from '../activities/memory/extraction-plan.js';
import {
  MEMORY_EXTRACTION_SYSTEM,
  memoryExtractionPrompt,
} from '../activities/memory/prompt.js';
import { MEMORY_EXTRACT_MODEL } from '../consts.js';
import { getChatModel } from '../services/llm/provider.js';
import { MEMORY_CASES } from './fixtures/memory-extraction-cases.js';
import {
  describeOperations,
  scoreCase,
  selectCases,
  summarizeCases,
  parseRepeats,
  type MemoryCaseResult,
} from './memory-extraction-metrics.js';

function option(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const print = (line: string) => process.stdout.write(`${line}\n`);

const pct = (v: number | null) =>
  v === null ? '—' : `${(v * 100).toFixed(1)}%`;

async function main() {
  const repeats = parseRepeats(option('--repeats'));
  const cases = selectCases(MEMORY_CASES, {
    ids: option('--cases'),
    kinds: option('--kind'),
  });
  const showOps = process.argv.includes('--show-ops');
  const generate = structuredGenerator(
    await getChatModel(MEMORY_EXTRACT_MODEL),
  );
  const results: (MemoryCaseResult & {
    repeat: number;
    operations: string[];
    droppedByParse: number;
  })[] = [];
  let tokens = 0;

  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const c of cases) {
      const current: CurrentMemory[] = (c.current ?? []).map((content, i) => ({
        ref: `m${i + 1}`,
        publicId: `case-${c.id}-${i}`,
        content,
        version: 1,
        updatedAt: new Date(0),
      }));
      const answer = await generate({
        system: MEMORY_EXTRACTION_SYSTEM,
        prompt: memoryExtractionPrompt(current, c.message),
        schema: extractionAnswerSchema as z.ZodType,
      });
      tokens += answer.usage.inputTokens + answer.usage.outputTokens;
      const parsed = parseOperations(answer.object);
      const plan = planMemoryApply(
        current,
        parsed?.operations ?? [],
        c.message,
      );
      results.push({
        ...scoreCase(c, plan),
        repeat,
        operations: describeOperations(current, parsed?.operations ?? null),
        droppedByParse: parsed?.dropped ?? 0,
      });
    }
  }

  const summary = summarizeCases(results);
  print(`model: ${MEMORY_EXTRACT_MODEL}, cases: ${cases.length} × ${repeats}`);
  print(`keep precision   ${pct(summary.keepPrecision)}`);
  print(`keep recall      ${pct(summary.keepRecall)}`);
  print(`drop recall      ${pct(summary.dropRecall)}`);
  print(
    `org-fact drops   ${pct(summary.orgFactDropRate)}   (rollout gate: ≥ 95%)`,
  );
  print(
    `"yes, like that" ${pct(summary.yesLikeThatKept)}   (cost of excluding the answer)`,
  );
  for (const [kind, { correct, total }] of Object.entries(summary.byKind)) {
    print(`  ${kind.padEnd(14)} ${correct}/${total}`);
  }
  for (const r of results.filter((x) => showOps || !x.correct)) {
    print(
      `  ${r.correct ? '✓' : '✗'} ${r.id} (repeat ${r.repeat}): ${r.expect}, wrote=${r.wrote}${r.supersedesOk ? '' : ', m1 not superseded'}${r.droppedByParse ? `, ${r.droppedByParse} malformed` : ''}`,
    );
    for (const line of r.operations) {
      print(`      ${line}`);
    }
  }
  print(`tokens: ${tokens}`);

  const out = option('--json');
  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        {
          model: MEMORY_EXTRACT_MODEL,
          repeats,
          cases: cases.map((c) => c.id),
          summary,
          results,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
