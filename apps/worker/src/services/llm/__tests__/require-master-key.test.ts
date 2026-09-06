import { isMasterKeyRequired } from '../require-master-key';

/**
 * `NODE_ENV` is `test` while Jest runs, which on its own short-circuits the
 * rule. Every case here therefore passes an explicit environment object rather
 * than leaning on the ambient one.
 */
const env = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv =>
  ({ NODE_ENV: 'production', ...overrides }) as NodeJS.ProcessEnv;

describe('isMasterKeyRequired', () => {
  it('is satisfied once the key is present, whatever the environment', () => {
    expect(
      isMasterKeyRequired(
        env({ LITELLM_MASTER_KEY: 'sk-x', TARGET_ENV: 'production' }),
      ),
    ).toBe(false);
  });

  it.each(['development', 'test'])(
    'excuses a missing key when NODE_ENV is %s',
    (nodeEnv) => {
      expect(isMasterKeyRequired(env({ NODE_ENV: nodeEnv }))).toBe(false);
    },
  );

  it.each(['local', 'test', 'e2e', 'ci'])(
    'excuses a missing key when TARGET_ENV is %s',
    (targetEnv) => {
      // `e2e` and `ci` are the regression: the hand-written list this replaced
      // named only `local` and `test`, so a CI run with no master key threw
      // here instead of falling through to the suite's mock proxy.
      expect(isMasterKeyRequired(env({ TARGET_ENV: targetEnv }))).toBe(false);
    },
  );

  it.each(['demo', 'staging', 'production'])(
    'requires the key when TARGET_ENV is %s',
    (targetEnv) => {
      expect(isMasterKeyRequired(env({ TARGET_ENV: targetEnv }))).toBe(true);
    },
  );

  it('requires the key when TARGET_ENV is unset', () => {
    // A container that never received its configuration is precisely what
    // this check is for, so an absent value must not be an excuse.
    expect(isMasterKeyRequired(env())).toBe(true);
  });

  it.each(['', '   ', '\t'])(
    'requires the key when TARGET_ENV is blank (%j)',
    (targetEnv) => {
      // Regression: a cleared Railway variable arrives as '' rather than
      // undefined. Comparing the raw value against `undefined` let a
      // misconfigured worker start with no key at all.
      expect(isMasterKeyRequired(env({ TARGET_ENV: targetEnv }))).toBe(true);
    },
  );

  it('treats an empty master key as no master key', () => {
    expect(
      isMasterKeyRequired(
        env({ LITELLM_MASTER_KEY: '', TARGET_ENV: 'production' }),
      ),
    ).toBe(true);
  });
});
