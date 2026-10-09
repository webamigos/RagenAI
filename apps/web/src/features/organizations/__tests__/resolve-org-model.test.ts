import { afterEach, describe, expect, it, vi } from 'vitest';

const runtimeConfig = vi.hoisted(() => ({ hideModelSelector: '' }));

vi.mock('@ragenai/prisma-client', () => ({ default: {} }));
vi.mock('@/config/public-runtime-config', () => ({
  readPublicRuntimeConfig: () => runtimeConfig,
}));

import { resolveOrgModel } from '../services/organization-settings';

/**
 * The answer model an organization gets before anyone picks one. It used to
 * ignore DEFAULT_MODEL while the selector was visible, so a deployment
 * configured for OpenRouter preselected gemini-3-flash-preview — a model its
 * picker did not list and its credentials could not serve.
 */
describe('resolveOrgModel', () => {
  const ORIGINAL = process.env.DEFAULT_MODEL;

  afterEach(() => {
    runtimeConfig.hideModelSelector = '';
    if (ORIGINAL === undefined) {
      delete process.env.DEFAULT_MODEL;
    } else {
      process.env.DEFAULT_MODEL = ORIGINAL;
    }
  });

  it('falls back to DEFAULT_MODEL when the organization picked none', () => {
    process.env.DEFAULT_MODEL = 'claude-sonnet-5-5-openrouter';

    expect(resolveOrgModel(null)).toBe('claude-sonnet-5-5-openrouter');
    expect(resolveOrgModel('')).toBe('claude-sonnet-5-5-openrouter');
  });

  it("keeps the organization's own choice over DEFAULT_MODEL", () => {
    process.env.DEFAULT_MODEL = 'claude-sonnet-5-5-openrouter';

    expect(resolveOrgModel('mistral-small-3.2')).toBe('mistral-small-3.2');
  });

  it('uses the code default only when neither is set', () => {
    delete process.env.DEFAULT_MODEL;

    expect(resolveOrgModel(null)).toBe('gemini-3-flash-preview');
  });

  it('lets DEFAULT_MODEL override the organization while the selector is hidden', () => {
    runtimeConfig.hideModelSelector = '1';
    process.env.DEFAULT_MODEL = 'claude-sonnet-5-5-openrouter';

    expect(resolveOrgModel('mistral-small-3.2')).toBe(
      'claude-sonnet-5-5-openrouter',
    );
  });
});
