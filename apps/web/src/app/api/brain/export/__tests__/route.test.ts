import { strFromU8, unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ getBrainAccessQuery: vi.fn() }));
const bundle = vi.hoisted(() => ({ getBrainBundleQuery: vi.fn() }));
vi.mock(
  '@/features/brain/services/queries/get-brain-access-query',
  () => access,
);
vi.mock(
  '@/features/brain/services/queries/get-brain-bundle-query',
  () => bundle,
);
vi.mock('@/app/lib/utils/logger', () => ({ logger: { info: vi.fn() } }));

const { GET } = await import('../route');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/brain/export', () => {
  it('answers 404 to anyone the panel would 404, building nothing', async () => {
    access.getBrainAccessQuery.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(bundle.getBrainBundleQuery).not.toHaveBeenCalled();
  });

  it('zips the bundle for the session’s organization', async () => {
    access.getBrainAccessQuery.mockResolvedValue({ orgId: 'org-1' });
    bundle.getBrainBundleQuery.mockResolvedValue({
      files: new Map([
        ['pages/a.md', '---\nid: x\n---\n\n# A\n'],
        ['graph.json', '{}\n'],
        ['manifest.json', '{}\n'],
      ]),
      manifest: { generatedAt: '2026-09-24T01:00:00.000Z', pages: [{}] },
      skipped: [{ id: 'y', title: 'Y', reason: 'no-owner' }],
    });
    const res = await GET();
    expect(bundle.getBrainBundleQuery).toHaveBeenCalledWith('org-1');
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toContain(
      'ragen-brain-2026-09-24.zip',
    );
    expect(res.headers.get('x-brain-skipped')).toBe('1');
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      'graph.json',
      'manifest.json',
      'pages/a.md',
    ]);
    expect(strFromU8(files['pages/a.md']!)).toContain('# A');
  });
});
