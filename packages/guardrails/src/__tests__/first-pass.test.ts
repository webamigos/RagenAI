import type { DecideResult, ServedModel } from '@ragenai/basal-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuardrailRule } from '../contracts/guardrail';
import {
  BASAL_ATTACK_OPTION,
  BASAL_FIRST_PASS_CALIBRATION,
  BASAL_FIRST_PASS_TIMEOUT_MS,
  BASAL_JAILBREAK_QUESTION,
  BASAL_JAILBREAK_WORDINGS,
  FIRST_PASS_MIN_LENGTH,
  basalQuestionFor,
  firstPassFor,
  firstPassLanguage,
  firstPassVerdict,
  isFirstPassRule,
  readAttackProbability,
  runFirstPass,
  type FirstPass,
  type FirstPassCalibration,
} from '../evaluator/first-pass';
import {
  JAILBREAK_GUARDRAIL_KEY,
  POLICY_JUDGE_MAX_INPUT_CHARS,
  runPolicyRules,
  type JudgePolicy,
} from '../evaluator/policy';

const SERVED: ServedModel = { name: 'basal-2.0-4.5B-GGUF', mode: 'ollama' };

const calibration: FirstPassCalibration = {
  servedModel: SERVED,
  wording: 'four-way-en',
  clearMaxPAttack: 0.05,
};

const jailbreak = (over: Partial<GuardrailRule> = {}): GuardrailRule => ({
  publicId: 'jb-1',
  organizationId: null,
  key: JAILBREAK_GUARDRAIL_KEY,
  name: 'Jailbreak detection',
  description: null,
  kind: 'BUILT_IN',
  stage: 'INPUT',
  action: 'BLOCK',
  enabled: true,
  severity: 'critical',
  pattern: null,
  patternIsRegex: false,
  policy: null,
  threshold: null,
  ...over,
});

const policy = (over: Partial<GuardrailRule> = {}): GuardrailRule =>
  jailbreak({
    publicId: 'policy-1',
    key: null,
    kind: 'LLM_POLICY',
    name: 'No competitor pricing',
    policy: 'Never discuss a competitor’s pricing.',
    ...over,
  });

const answered = (pAttack: number, model = SERVED.name): DecideResult => ({
  outcome: 'answered',
  response: {
    model,
    answers: {
      [BASAL_JAILBREAK_QUESTION]: {
        type: 'choice',
        choice: pAttack >= 0.5 ? BASAL_ATTACK_OPTION : 'question',
        probabilities: {
          question: 1 - pAttack,
          task: 0,
          conversation: 0,
          [BASAL_ATTACK_OPTION]: pAttack,
        },
        confidence: Math.max(pAttack, 1 - pAttack),
      },
    },
  },
});

const ENGLISH = 'Summarise the attached contract in three bullet points.';
const POLISH =
  'Jakie są zasady rozliczania delegacji zagranicznych w naszej firmie?';
const GERMAN =
  'Welche Regeln gelten in unserer Firma für Dienstreisen ins Ausland?';
const UKRAINIAN =
  'Які правила щодо закордонних відряджень діють у нашій компанії?';

describe('which rule the first pass is asked about', () => {
  it('is the jailbreak built-in on the input stage only', () => {
    expect(isFirstPassRule(jailbreak())).toBe(true);
    expect(isFirstPassRule(jailbreak({ stage: 'OUTPUT' }))).toBe(false);
    expect(isFirstPassRule(jailbreak({ key: 'content-moderation' }))).toBe(
      false,
    );
  });

  it('is never an LLM_POLICY: its question would carry prose nobody calibrated', () => {
    expect(isFirstPassRule(policy())).toBe(false);
    expect(basalQuestionFor(policy(), ENGLISH, 'four-way-en')).toBeNull();
  });
});

describe('basalQuestionFor', () => {
  it('asks one choice question, worded as the calibration says', () => {
    const request = basalQuestionFor(jailbreak(), ENGLISH, 'four-way-pl');

    expect(request).toEqual({
      state: ENGLISH,
      questions: {
        [BASAL_JAILBREAK_QUESTION]: BASAL_JAILBREAK_WORDINGS['four-way-pl'],
      },
    });
  });

  it('shows basal the same truncated text the judge is shown', () => {
    const long = 'a'.repeat(POLICY_JUDGE_MAX_INPUT_CHARS + 50);

    const request = basalQuestionFor(jailbreak(), long, 'four-way-en');

    expect(request?.state).toHaveLength(POLICY_JUDGE_MAX_INPUT_CHARS);
  });

  it('offers an attack option in every wording', () => {
    for (const question of Object.values(BASAL_JAILBREAK_WORDINGS)) {
      expect(question.type).toBe('choice');
      expect(Object.keys(question.criteria)).toContain(BASAL_ATTACK_OPTION);
    }
  });
});

describe('readAttackProbability', () => {
  it('reads the attack option of the one question', () => {
    expect(readAttackProbability(answered(0.12))).toBe(0.12);
  });

  it('is null when there is no answer, or not a choice', () => {
    expect(
      readAttackProbability({ outcome: 'unavailable', reason: 'timeout' }),
    ).toBeNull();
    expect(
      readAttackProbability({
        outcome: 'answered',
        response: {
          model: SERVED.name,
          answers: {
            [BASAL_JAILBREAK_QUESTION]: {
              type: 'noul',
              noul: 0.01,
              probabilities: { true: 0.01, false: 0.99 },
              confidence: 0.99,
            },
          },
        },
      }),
    ).toBeNull();
  });
});

describe('the language gate', () => {
  it('admits a confidently Polish or English message', () => {
    expect(firstPassLanguage(POLISH)).toBe('pol');
    expect(firstPassLanguage(ENGLISH)).toBe('eng');
  });

  it('refuses German and Ukrainian, which basal was not trained on', () => {
    expect(firstPassLanguage(GERMAN)).toBeNull();
    expect(firstPassLanguage(UKRAINIAN)).toBeNull();
  });

  it('refuses English that franc misreads, which costs a clearance and nothing else', () => {
    // Trigram detection is weak on short text: this reads as French. The gate
    // then sends an ordinary English question to the judge, as today. A3's
    // "gated by language" counts how often that happens on the real set.
    expect(
      firstPassLanguage(
        'What does our travel policy say about booking business class?',
      ),
    ).toBeNull();
  });

  it('refuses a message too short to tell', () => {
    expect(firstPassLanguage('a'.repeat(FIRST_PASS_MIN_LENGTH - 1))).toBeNull();
    expect(firstPassLanguage('Ok, thanks!')).toBeNull();
  });
});

describe('the clearing rule', () => {
  const verdict = (
    result: DecideResult,
    over: { served?: ServedModel | null; ruleThreshold?: number } = {},
  ) =>
    firstPassVerdict({
      result,
      served: over.served === undefined ? SERVED : over.served,
      calibration,
      ruleThreshold: over.ruleThreshold ?? 0.7,
    });

  it('clears at or below the fitted maximum, scoring P(attack)', () => {
    expect(verdict(answered(0.05))).toEqual({
      outcome: 'cleared',
      score: 0.05,
    });
    expect(verdict(answered(0))).toEqual({ outcome: 'cleared', score: 0 });
  });

  it('suspects anything above it, whether or not basal chose attack', () => {
    expect(verdict(answered(0.06))).toEqual({
      outcome: 'suspected',
      pAttack: 0.06,
    });
    expect(verdict(answered(0.9)).outcome).toBe('suspected');
  });

  it('never disagrees with a rule whose own threshold is lower', () => {
    expect(verdict(answered(0.03), { ruleThreshold: 0.03 }).outcome).toBe(
      'suspected',
    );
    expect(verdict(answered(0.02), { ruleThreshold: 0.03 }).outcome).toBe(
      'cleared',
    );
  });

  it('times out as a timeout and fails every other way as an error', () => {
    expect(verdict({ outcome: 'unavailable', reason: 'timeout' })).toEqual({
      outcome: 'timeout',
    });
    for (const reason of [
      'network',
      'http',
      'malformed',
      'breaker-open',
    ] as const) {
      expect(verdict({ outcome: 'unavailable', reason })).toEqual({
        outcome: 'error',
      });
    }
  });

  it('defers when the served model is unknown', () => {
    expect(verdict(answered(0.01), { served: null }).outcome).toBe('deferred');
  });

  it('defers when the engine differs under the same name', () => {
    // Finding 4: one folder, one calibration per engine.
    expect(
      verdict(answered(0.01), { served: { ...SERVED, mode: 'llamacpp' } })
        .outcome,
    ).toBe('deferred');
  });

  it('defers when the answer names another model than the one cached', () => {
    expect(verdict(answered(0.01, 'basal-2.0-max-GGUF')).outcome).toBe(
      'deferred',
    );
  });
});

describe('runFirstPass', () => {
  let decide: ReturnType<typeof vi.fn>;
  let servedModel: ReturnType<typeof vi.fn>;
  let firstPass: FirstPass;

  beforeEach(() => {
    decide = vi.fn().mockResolvedValue(answered(0.01));
    servedModel = vi.fn().mockResolvedValue(SERVED);
    firstPass = { decide, servedModel };
  });

  it('asks with the first-pass timeout and clears', async () => {
    const result = await runFirstPass(
      jailbreak(),
      ENGLISH,
      firstPass,
      calibration,
    );

    expect(result).toEqual({ outcome: 'cleared', score: 0.01 });
    expect(decide).toHaveBeenCalledWith(
      basalQuestionFor(jailbreak(), ENGLISH, calibration.wording),
      BASAL_FIRST_PASS_TIMEOUT_MS,
    );
  });

  it('does not ask basal when the gate refuses the language', async () => {
    const result = await runFirstPass(
      jailbreak(),
      GERMAN,
      firstPass,
      calibration,
    );

    expect(result).toEqual({ outcome: 'gated' });
    expect(decide).not.toHaveBeenCalled();
  });

  it('defers rather than wait on a slow served-model read', async () => {
    vi.useFakeTimers();
    try {
      servedModel.mockReturnValue(new Promise(() => {}));

      const pending = runFirstPass(
        jailbreak(),
        ENGLISH,
        firstPass,
        calibration,
      );
      await vi.advanceTimersByTimeAsync(BASAL_FIRST_PASS_TIMEOUT_MS);

      expect((await pending).outcome).toBe('deferred');
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns a client that throws into an error, not a rejection', async () => {
    decide.mockRejectedValue(new Error('boom'));

    await expect(
      runFirstPass(jailbreak(), ENGLISH, firstPass, calibration),
    ).resolves.toEqual({ outcome: 'error' });
  });
});

describe('runPolicyRules with a first pass', () => {
  const judgeScoring = (score: number): JudgePolicy =>
    vi.fn().mockResolvedValue({ outcome: 'scored', score });

  const basal = (result: DecideResult): FirstPass => ({
    decide: vi.fn().mockResolvedValue(result),
    servedModel: vi.fn().mockResolvedValue(SERVED),
  });

  it('skips the judge for a cleared rule and scores it with P(attack)', async () => {
    const judge = judgeScoring(0.99);

    const run = await runPolicyRules([jailbreak()], ENGLISH, judge, {
      firstPass: firstPassFor(basal(answered(0.02)), calibration),
    });

    expect(judge).not.toHaveBeenCalled();
    expect(run.scored).toEqual([{ rule: jailbreak(), score: 0.02 }]);
    expect(run.hits).toEqual([]);
    expect(run.firstPass).toEqual([{ rule: jailbreak(), outcome: 'cleared' }]);
  });

  it('asks the judge, as before, for everything basal does not clear', async () => {
    for (const result of [
      answered(0.4),
      { outcome: 'unavailable', reason: 'timeout' } as const,
      { outcome: 'unavailable', reason: 'network' } as const,
    ]) {
      const judge = judgeScoring(0.95);

      const run = await runPolicyRules([jailbreak()], ENGLISH, judge, {
        firstPass: firstPassFor(basal(result), calibration),
      });

      expect(judge).toHaveBeenCalledTimes(1);
      expect(run.hits).toEqual([{ rule: jailbreak(), score: 0.95 }]);
    }
  });

  it('never asks basal about an LLM_POLICY', async () => {
    const client = basal(answered(0));
    const judge = judgeScoring(0.1);

    const run = await runPolicyRules([policy()], ENGLISH, judge, {
      firstPass: firstPassFor(client, calibration),
    });

    expect(client.decide).not.toHaveBeenCalled();
    expect(judge).toHaveBeenCalledTimes(1);
    expect(run.firstPass).toEqual([]);
  });

  it('falls through to the judge when the first pass itself throws', async () => {
    const judge = judgeScoring(0.1);

    const run = await runPolicyRules([jailbreak()], ENGLISH, judge, {
      firstPass: () => {
        throw new Error('boom');
      },
    });

    expect(judge).toHaveBeenCalledTimes(1);
    expect(run.firstPass).toEqual([{ rule: jailbreak(), outcome: 'error' }]);
    expect(run.errors).toEqual([]);
  });
});

describe('the shipped calibration', () => {
  it('is null until A4 records a go, so nothing is cleared', () => {
    // When this fails, A4 has fitted a threshold: the spec records the run it
    // came from, and this test is updated with it.
    expect(BASAL_FIRST_PASS_CALIBRATION).toBeNull();
  });
});
