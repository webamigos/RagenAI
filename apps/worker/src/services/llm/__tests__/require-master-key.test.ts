import { isMasterKeyRequired } from '../require-master-key.js';

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

  /**
   * Phase B's third hatch. Without it, a deployed worker running the gateway
   * refuses to boot over a credential nothing on that path authenticates with
   * — and the obvious workaround is to set a dummy master key, which is how a
   * boot check stops being believed.
   */
  it('excuses a missing key when the gateway is native', () => {
    expect(
      isMasterKeyRequired(
        env({ LLM_GATEWAY: 'native', TARGET_ENV: 'production' }),
      ),
    ).toBe(false);
  });

  it('still requires the key when the gateway is the proxy', () => {
    expect(
      isMasterKeyRequired(
        env({ LLM_GATEWAY: 'litellm', TARGET_ENV: 'production' }),
      ),
    ).toBe(true);
  });

  /** A typo must not read as "native" and quietly drop the requirement. */
  it('refuses an unrecognised gateway value rather than excusing the key', () => {
    expect(() =>
      isMasterKeyRequired(
        env({ LLM_GATEWAY: 'nativ', TARGET_ENV: 'production' }),
      ),
    ).toThrow(/LLM_GATEWAY/);
  });

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
