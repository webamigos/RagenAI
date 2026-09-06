import { describe, expect, it } from 'vitest';

import {
  isDeployedEnv,
  normalizeTargetEnv,
  NON_DEPLOYED_TARGET_ENVS,
  TARGET_ENV_VALUES,
} from '../target-env';

describe('normalizeTargetEnv', () => {
  it.each(['', '   ', '\t', '\n'])(
    'reads a blank value (%j) as unset',
    (value) => {
      // A cleared Railway variable arrives like this. The two call sites that
      // treat "unset" as the dangerous case compare against `undefined`, so a
      // blank string reaching them raw would slip past the guard entirely.
      expect(normalizeTargetEnv(value)).toBeUndefined();
    },
  );

  it('passes undefined through', () => {
    expect(normalizeTargetEnv(undefined)).toBeUndefined();
  });

  it('trims a real value rather than rejecting it', () => {
    expect(normalizeTargetEnv('  production  ')).toBe('production');
  });
});

describe('isDeployedEnv', () => {
  it.each(['local', 'test', 'e2e', 'ci'])(
    '%s is not a deployment, so a fresh clone keeps its optional config',
    (value) => {
      expect(isDeployedEnv(value)).toBe(false);
    },
  );

  it.each(['staging', 'production', 'demo'])(
    '%s is a deployment and must satisfy the deployed-only rules',
    (value) => {
      expect(isDeployedEnv(value)).toBe(true);
    },
  );

  it('reads an unset value as not deployed', () => {
    // Five of the seven call sites this replaces did the same. `npm run dev`
    // on a fresh clone has no TARGET_ENV and must not start demanding
    // production credentials.
    expect(isDeployedEnv(undefined)).toBe(false);
  });

  it.each(['', '   ', '\t'])(
    'reads a blank value (%j) as unset rather than as a deployment name',
    (value) => {
      // A Railway variable someone cleared arrives as an empty string, which
      // a bare `!NON_DEPLOYED.includes(value)` would classify as deployed.
      expect(isDeployedEnv(value)).toBe(false);
    },
  );

  it('tolerates surrounding whitespace on a real value', () => {
    expect(isDeployedEnv('  production  ')).toBe(true);
    expect(isDeployedEnv('  local  ')).toBe(false);
  });

  /**
   * The point of the denylist. An environment added to the enum later is
   * deployed until someone says otherwise, so it inherits the configuration
   * checks rather than escaping them — which is how `demo` became a real
   * deployment without a second edit.
   */
  it('treats a value outside the enum as deployed, failing safe', () => {
    expect(isDeployedEnv('some-future-environment')).toBe(true);
  });

  it('classifies every value in the enum, leaving none unaccounted for', () => {
    const deployed = TARGET_ENV_VALUES.filter((value) => isDeployedEnv(value));
    const notDeployed = TARGET_ENV_VALUES.filter(
      (value) => !isDeployedEnv(value),
    );

    expect([...deployed, ...notDeployed].sort()).toEqual(
      [...TARGET_ENV_VALUES].sort(),
    );
    expect(notDeployed.sort()).toEqual([...NON_DEPLOYED_TARGET_ENVS].sort());
  });

  it('keeps every non-deployed value inside the enum', () => {
    // A typo in NON_DEPLOYED_TARGET_ENVS would otherwise silently promote a
    // real environment to "deployed" and go unnoticed.
    for (const value of NON_DEPLOYED_TARGET_ENVS) {
      expect(TARGET_ENV_VALUES).toContain(value);
    }
  });
});
