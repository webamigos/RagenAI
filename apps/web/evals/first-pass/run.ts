/**
 * A3/A4 of the basal first-pass spec, against a running basal-serve and the
 * real judge model.
 *
 * Every row is asked three ways, all through the package's own functions —
 * a harness with its own copy of the question would measure a path no turn
 * runs (docs/lessons/a-test-box-that-runs-a-different-path-is-worse-than-none.md):
 *
 * 1. the judge, through `runPolicyRules` and apps/web's own judge binding,
 *    once per row (the judge does not depend on the wording);
 * 2. basal directly, `basalQuestionFor` + `decide`, with a generous timeout,
 *    so every row has a P(attack) to fit a threshold on;
 * 3. `runPolicyRules` with `firstPassFor(client, calibration)` at the
 *    production timeout, the path a turn takes. The judge here answers from
 *    step 1's cache, so the arm costs no second bill.
 *
 * See ./README.md for how to run it, and for the rules about which split may
 * be run when.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { createBasalClient, isBasalConfigured } from '@ragenai/basal-client';
import {
  BASAL_JAILBREAK_WORDINGS,
  JAILBREAK_GUARDRAIL_KEY,
  POLICY_JUDGE_MODEL,
  basalQuestionFor,
  firstPassFor,
  firstPassLanguage,
  policyThresholdFor,
  readAttackProbability,
  runPolicyRules,
  type BasalJailbreakWording,
  type GuardrailRule,
  type JudgePolicy,
  type PolicyJudgement,
} from '@ragenai/guardrails';

import { createPolicyJudge } from '@/features/guardrails/utils/policy-judge';

import { loadLabelledSet } from './lib/dataset';
import {
  decideGo,
  fitClearMax,
  summarize,
  type RowMeasurement,
} from './lib/fit';
import { renderReport, type WordingResult } from './lib/report';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    set: { type: 'string' },
    split: { type: 'string', default: 'tuning' },
    wording: { type: 'string' },
    'clear-max': { type: 'string' },
    'tuning-false-clearances': { type: 'string' },
    'judge-adds-ms': { type: 'string' },
    'no-judge': { type: 'boolean', default: false },
    'measure-timeout-ms': { type: 'string', default: '30000' },
    out: { type: 'string', default: join(__dirname, 'results') },
  },
});

function fail(message: string): never {
  console.error(`first-pass: ${message}`);
  process.exit(1);
}

/** The seeded built-in, at its default threshold. */
const JAILBREAK_RULE: GuardrailRule = {
  publicId: 'first-pass-eval',
  organizationId: null,
  key: JAILBREAK_GUARDRAIL_KEY,
  name: 'Jailbreak detection',
  description: null,
  kind: 'BUILT_IN',
  stage: 'INPUT',
  action: 'LOG',
  enabled: true,
  severity: 'critical',
  pattern: null,
  patternIsRegex: false,
  policy: null,
  threshold: null,
};

async function main(): Promise<void> {
  const setPath =
    args.set ?? fail('--set <path to a labelled split> is required');
  const split = args.split;
  if (split !== 'tuning' && split !== 'holdout') {
    fail('--split is tuning or holdout');
  }
  // The holdout is opened once, by A4, with one configuration fixed on the
  // tuning half. Naming the split twice is what stops a tuning run from
  // reading it by accident.
  if (basename(setPath).includes('holdout') !== (split === 'holdout')) {
    fail(`--split ${split} does not match the file name ${basename(setPath)}`);
  }

  const allWordings = Object.keys(
    BASAL_JAILBREAK_WORDINGS,
  ) as BasalJailbreakWording[];
  const wordings = (args.wording?.split(',') ??
    allWordings) as BasalJailbreakWording[];
  for (const w of wordings) {
    if (!allWordings.includes(w)) {
      fail(`unknown wording ${w}; one of ${allWordings.join(', ')}`);
    }
  }

  let fixedClearMax: number | null = null;
  if (split === 'holdout') {
    if (wordings.length !== 1 || args['clear-max'] === undefined) {
      fail(
        'a holdout run takes exactly one --wording and the --clear-max fitted on the tuning half',
      );
    }
    if (args['tuning-false-clearances'] === undefined) {
      fail(
        'a holdout run takes --tuning-false-clearances from the tuning report',
      );
    }
    fixedClearMax = Number(args['clear-max']);
    if (!Number.isFinite(fixedClearMax)) {
      fail('--clear-max is a number');
    }
  }

  if (!isBasalConfigured()) {
    fail('BASAL_URL is not set');
  }
  const client = createBasalClient({
    url: process.env.BASAL_URL!,
    ...(process.env.BASAL_API_KEY ? { apiKey: process.env.BASAL_API_KEY } : {}),
    logger: { warn: (meta, message) => console.warn(message, meta) },
  });

  const rows = loadLabelledSet(setPath);
  const ruleThreshold = policyThresholdFor(JAILBREAK_RULE);
  const measureTimeoutMs = Number(args['measure-timeout-ms']);

  // One real call to each model before the long run: a provider that is not
  // configured reads as a column of errors otherwise
  // (docs/lessons/a-provider-package-is-not-configured-until-something-calls-it.md).
  const servedModel = await client.servedModel();
  if (servedModel === null) {
    fail(
      'basal did not report its served model (name and mode); nothing can be fitted for it',
    );
  }
  const probe = basalQuestionFor(
    JAILBREAK_RULE,
    'What does our travel policy say about booking business class?',
    wordings[0],
  )!;
  const probed = await client.decide(probe, measureTimeoutMs);
  if (probed.outcome !== 'answered' || readAttackProbability(probed) === null) {
    fail(`basal did not answer the probe: ${JSON.stringify(probed)}`);
  }

  // 1. The judge, once per row, through the loop a turn runs.
  const judgements = new Map<
    string,
    { judgement: PolicyJudgement; ms: number }
  >();
  if (!args['no-judge']) {
    const judge = createPolicyJudge({ tracking: undefined });
    const judgeOnce = async (text: string) => {
      let judgement: PolicyJudgement = {
        outcome: 'error',
        reason: 'not asked',
      };
      const started = performance.now();
      await runPolicyRules([JAILBREAK_RULE], text, async (request) => {
        judgement = await judge(request);
        return judgement;
      });
      return { judgement, ms: performance.now() - started };
    };
    const first = await judgeOnce(probe.state);
    if (first.judgement.outcome === 'error') {
      fail(`the judge did not answer the probe: ${first.judgement.reason}`);
    }
    for (const [i, row] of rows.entries()) {
      judgements.set(row.text, await judgeOnce(row.text));
      process.stdout.write(`\rjudge ${i + 1}/${rows.length}`);
    }
    process.stdout.write('\n');
  }
  /** The arm's judge: step 1's answer, so the arm costs no second bill. */
  const cachedJudgeFor =
    (text: string): JudgePolicy =>
    () =>
      Promise.resolve(
        judgements.get(text)?.judgement ?? {
          outcome: 'error',
          reason: 'judge not run (--no-judge)',
        },
      );

  const results: WordingResult[] = [];
  const raw: Record<string, RowMeasurement[]> = {};

  for (const wording of wordings) {
    // 2. basal directly, generous timeout.
    const measured: RowMeasurement[] = [];
    for (const [i, row] of rows.entries()) {
      const request = basalQuestionFor(JAILBREAK_RULE, row.text, wording)!;
      const started = performance.now();
      const result = await client.decide(request, measureTimeoutMs);
      const basalMs = performance.now() - started;
      const judged = judgements.get(row.text);
      measured.push({
        row,
        gated: (await firstPassLanguage(row.text)) === null,
        pAttack: readAttackProbability(result),
        basalMs: result.outcome === 'answered' ? basalMs : null,
        judgeScore:
          judged?.judgement.outcome === 'scored'
            ? judged.judgement.score
            : null,
        judgeMs: judged ? judged.ms : null,
      });
      process.stdout.write(`\r${wording}: basal ${i + 1}/${rows.length}`);
    }
    process.stdout.write('\n');

    const fit =
      fixedClearMax === null
        ? fitClearMax(measured)
        : ({ clearMax: fixedClearMax, lowestAttack: Number.NaN } as const);

    // 3. The turn's own path, at the production timeout.
    if (fit.clearMax !== null) {
      const firstPass = firstPassFor(client, {
        servedModel,
        wording,
        clearMaxPAttack: fit.clearMax,
      });
      for (const [i, m] of measured.entries()) {
        const run = await runPolicyRules(
          [JAILBREAK_RULE],
          m.row.text,
          cachedJudgeFor(m.row.text),
          { firstPass },
        );
        measured[i] = { ...m, firstPassOutcome: run.firstPass[0]?.outcome };
      }
    }

    raw[wording] = measured;
    results.push({
      wording,
      fit,
      summary: summarize(measured, fit.clearMax, ruleThreshold),
    });
  }

  const decision =
    split === 'holdout'
      ? decideGo({
          holdout: results[0].summary,
          tuningFalseClearances: Number(args['tuning-false-clearances']),
          judgeAddsMs:
            args['judge-adds-ms'] === undefined
              ? null
              : Number(args['judge-adds-ms']),
        })
      : undefined;

  const date = new Date().toISOString().slice(0, 10);
  const stem =
    `${date}-${split}-${servedModel.name}-${servedModel.mode}`.replace(
      /[^\w.-]+/g,
      '-',
    );
  mkdirSync(args.out, { recursive: true });
  writeFileSync(
    join(args.out, `${stem}.md`),
    renderReport(
      {
        date,
        setPath,
        split,
        servedModel,
        judgeModel: args['no-judge'] ? 'not run' : POLICY_JUDGE_MODEL,
        ruleThreshold,
      },
      results,
      decision,
    ),
  );
  writeFileSync(
    join(args.out, `${stem}.raw.json`),
    JSON.stringify(raw, null, 2),
  );
  console.log(`wrote ${join(args.out, `${stem}.md`)}`);
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
