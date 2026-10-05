import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURES, FEATURE_KEYS, FEATURE_LABELS } from '../features';
describe('MCP OAuth deployment-independent organization gate', () => {
  it('is declared once and defaults to off', () => {
    expect(FEATURE_KEYS).toContain('mcpOAuth');
    expect(DEFAULT_FEATURES.mcpOAuth).toBe(false);
    expect(FEATURE_LABELS.mcpOAuth).toBeTruthy();
  });
});
