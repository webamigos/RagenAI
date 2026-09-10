import { describe, expect, it } from 'vitest';

import { applyEnvOverrides } from '../env-file';

describe('applyEnvOverrides', () => {
  it('replaces an uncommented KEY= line with the given value', () => {
    const template = [
      '# Core',
      'DATABASE_URL=postgresql://old',
      'OTHER=untouched',
    ].join('\n');

    const { content, missingKeys } = applyEnvOverrides(template, {
      DATABASE_URL: 'postgresql://new',
    });

    expect(content).toBe(
      ['# Core', 'DATABASE_URL=postgresql://new', 'OTHER=untouched'].join('\n'),
    );
    expect(missingKeys).toEqual([]);
  });

  it('uncomments a disabled line when it is targeted', () => {
    const template = '# LITELLM_MASTER_KEY=';

    const { content } = applyEnvOverrides(template, {
      LITELLM_MASTER_KEY: 'sk-generated',
    });

    expect(content).toBe('LITELLM_MASTER_KEY=sk-generated');
  });

  it('leaves every line not named in the overrides untouched', () => {
    const template = ['A=1', 'B=2', '# C='].join('\n');

    const { content } = applyEnvOverrides(template, { B: '20' });

    expect(content).toBe(['A=1', 'B=20', '# C='].join('\n'));
  });

  it('reports keys that never matched a line in the template', () => {
    const { missingKeys } = applyEnvOverrides('A=1', {
      A: '10',
      NOT_PRESENT: 'x',
    });

    expect(missingKeys).toEqual(['NOT_PRESENT']);
  });

  it('does not confuse a key with another key that shares its prefix', () => {
    const template = [
      'BETTER_AUTH_SECRET=',
      'BETTER_AUTH_URL=http://localhost:3000',
    ].join('\n');

    const { content } = applyEnvOverrides(template, {
      BETTER_AUTH_SECRET: 'generated',
    });

    expect(content).toBe(
      [
        'BETTER_AUTH_SECRET=generated',
        'BETTER_AUTH_URL=http://localhost:3000',
      ].join('\n'),
    );
  });
});
