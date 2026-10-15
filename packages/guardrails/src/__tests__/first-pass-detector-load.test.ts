import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GuardrailRule } from '../contracts/guardrail';
import {
  BASAL_FIRST_PASS_TIMEOUT_MS,
  runFirstPass,
  type FirstPassCalibration,
} from '../evaluator/first-pass';
import { JAILBREAK_GUARDRAIL_KEY } from '../evaluator/policy';

/**
 * The detector's first load is a 2 MB dynamic import. A turn that arrives
 * while it is still loading waits for it no longer than it would wait for
 * basal, then goes to the judge. Its own file, because the never-finishing
 * import below would otherwise be the detector for every other test.
 */
vi.mock('eld/medium', () => new Promise(() => {}));

afterEach(() => {
  vi.useRealTimers();
});

const rule: GuardrailRule = {
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
};

const calibration: FirstPassCalibration = {
  servedModel: { name: 'basal-2.0-4.5B-GGUF', mode: 'ollama' },
  wording: 'four-way-en',
  clearMaxPAttack: 0.05,
};

describe('a detector that is still loading', () => {
  it('times out within the first-pass budget and never asks basal', async () => {
    vi.useFakeTimers();
    const decide = vi.fn();

    const pending = runFirstPass(
      rule,
      'Summarise the attached contract in three bullet points.',
      { decide, servedModel: vi.fn() },
      calibration,
    );
    await vi.advanceTimersByTimeAsync(BASAL_FIRST_PASS_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({ outcome: 'timeout' });
    expect(decide).not.toHaveBeenCalled();
  });
});
