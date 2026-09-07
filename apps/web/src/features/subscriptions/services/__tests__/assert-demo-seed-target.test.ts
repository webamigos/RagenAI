import { describe, expect, it } from 'vitest';

import {
  DEMO_SEED_OVERRIDE_FLAG,
  assertDemoSeedTarget,
} from '../assert-demo-seed-target';

describe('assertDemoSeedTarget', () => {
  it('allows the demo environment', () => {
    expect(assertDemoSeedTarget({ targetEnv: 'demo', argv: [] })).toEqual({
      overridden: false,
      targetEnv: 'demo',
    });
  });

  it('refuses production, and says what it found', () => {
    expect(() =>
      assertDemoSeedTarget({ targetEnv: 'production', argv: [] }),
    ).toThrow(/TARGET_ENV is production, not "demo"/);
  });

  it.each([undefined, '', '   '])(
    'refuses when TARGET_ENV is %p, rather than reading absence as consent',
    (targetEnv) => {
      // Fail-closed is the whole point. A guard that passes on a missing
      // variable is the shape this repository has been bitten by twice.
      expect(() => assertDemoSeedTarget({ targetEnv, argv: [] })).toThrow(
        /TARGET_ENV is \(unset\)/,
      );
    },
  );

  it('refuses a near miss rather than guessing', () => {
    // `demo-2`, `Demo`, `staging` — none of them are the demo environment, and
    // a guard that normalises its way to yes is not a guard.
    for (const targetEnv of ['demo-2', 'Demo', 'staging', 'local']) {
      expect(() => assertDemoSeedTarget({ targetEnv, argv: [] })).toThrow();
    }
  });

  it('allows an explicit override, and reports that it was used', () => {
    expect(
      assertDemoSeedTarget({
        targetEnv: 'local',
        argv: ['--restrict-only', DEMO_SEED_OVERRIDE_FLAG],
      }),
    ).toEqual({ overridden: true, targetEnv: 'local' });
  });

  it('does not treat a similar-looking argument as the override', () => {
    expect(() =>
      assertDemoSeedTarget({ targetEnv: 'local', argv: ['--not-really'] }),
    ).toThrow();
  });
});
