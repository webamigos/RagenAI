import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveOrgFeatures = vi.hoisted(() => vi.fn());
vi.mock('../../../services/org-features.js', () => ({ resolveOrgFeatures }));
vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { applyContextPrefix } from '../apply-context-prefix.js';

const docs = [
  { pageContent: 'Opłata 4%.', metadata: { sectionPath: '4. Wynagrodzenie' } },
];
const args = { orgId: 'org-1', docs, fileName: 'umowa.pdf', summary: 'Umowa.' };

beforeEach(() => {
  resolveOrgFeatures.mockReset();
});

describe('applyContextPrefix', () => {
  it('returns the chunks unchanged when contextualChunks is off', async () => {
    resolveOrgFeatures.mockResolvedValue({
      contextualChunks: { value: false },
    });
    await expect(applyContextPrefix(args)).resolves.toBe(docs);
    expect(resolveOrgFeatures).toHaveBeenCalledWith('org-1');
  });

  it('prefixes them when it is on', async () => {
    resolveOrgFeatures.mockResolvedValue({ contextualChunks: { value: true } });
    const [chunk] = await applyContextPrefix(args);
    expect(chunk!.metadata).toMatchObject({
      contextPrefix: 'umowa — 4. Wynagrodzenie. Umowa.',
      contextVersion: 1,
    });
    expect(chunk!.pageContent).toBe('Opłata 4%.');
  });

  it('indexes without a prefix when the key cannot be read', async () => {
    resolveOrgFeatures.mockRejectedValue(new Error('db down'));
    await expect(applyContextPrefix(args)).resolves.toBe(docs);
  });
});
