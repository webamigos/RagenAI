import type { ServedModel } from '@ragenai/basal-client';
import {
  basalQuestionFor,
  firstPassFor,
  firstPassLanguage,
  readAttackProbability,
  runPolicyRules,
  type BasalJailbreakWording,
  type FirstPass,
  type GuardrailRule,
  type JudgePolicy,
  type PolicyJudgement,
} from '@ragenai/guardrails';

import type { LabelledRow } from './dataset';
import { fitClearMax, summarize, type RowMeasurement } from './fit';
import type { WordingResult } from './report';

export type JudgedRow = { judgement: PolicyJudgement; ms: number };

/**
 * Steps 2 and 3 of run.ts, for every wording: basal asked directly with a
 * generous timeout, then the turn's own path at the production timeout.
 *
 * `clientFor` is called once per measurement, so each one starts with a
 * closed breaker. The production-timeout arm is expected to time out on a
 * slow engine, and five timeouts open the client's breaker for a minute; one
 * client for the whole run carried that into the next wording's direct
 * measurement, which then got no answer at all (A3: `two-way-en`, 0/255 on
 * MLX). A turn shares one client, so within one arm the breaker stays as
 * production has it.
 */
export async function measureWordings(input: {
  readonly rows: readonly LabelledRow[];
  readonly wordings: readonly BasalJailbreakWording[];
  readonly rule: GuardrailRule;
  readonly clientFor: () => FirstPass;
  readonly servedModel: ServedModel;
  readonly measureTimeoutMs: number;
  readonly judgements: ReadonlyMap<string, JudgedRow>;
  /** A holdout run's threshold, fitted on the tuning half; `null` fits one. */
  readonly fixedClearMax: number | null;
  readonly ruleThreshold: number;
  readonly onProgress?: (wording: string, done: number, of: number) => void;
}): Promise<{
  results: WordingResult[];
  raw: Record<string, RowMeasurement[]>;
}> {
  const { rows, rule, judgements } = input;

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

  for (const wording of input.wordings) {
    // 2. basal directly, generous timeout.
    const direct = input.clientFor();
    const measured: RowMeasurement[] = [];
    for (const [i, row] of rows.entries()) {
      const request = basalQuestionFor(rule, row.text, wording)!;
      const started = performance.now();
      const result = await direct.decide(request, input.measureTimeoutMs);
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
      input.onProgress?.(wording, i + 1, rows.length);
    }

    const fit =
      input.fixedClearMax === null
        ? fitClearMax(measured)
        : ({
            clearMax: input.fixedClearMax,
            lowestAttack: Number.NaN,
          } as const);

    // 3. The turn's own path, at the production timeout.
    if (fit.clearMax !== null) {
      const arm = input.clientFor();
      // A running binding has the served model cached from earlier turns; a
      // fresh client reading it inside the first row's budget would defer
      // that row for a reason no turn has.
      await arm.servedModel();
      const firstPass = firstPassFor(arm, {
        servedModel: input.servedModel,
        wording,
        clearMaxPAttack: fit.clearMax,
      });
      for (const [i, m] of measured.entries()) {
        const run = await runPolicyRules(
          [rule],
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
      summary: summarize(measured, fit.clearMax, input.ruleThreshold),
    });
  }

  return { results, raw };
}
